/**
 * Plant Nursery POI Service
 * Fetches real, verified plant nurseries and garden centres using OpenStreetMap data.
 * Does not scrape Google Maps or Google Search.
 * Does not fabricate mock nursery locations.
 */

export interface PlantNursery {
  id: string;
  name: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  address?: string;
  phone?: string;
  openingHours?: string;
  website?: string;
  type: 'garden_centre' | 'plant_nursery' | 'plant_shop';
  distanceMeters?: number;
}

// Calculate Haversine distance in meters
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Parse raw Overpass API response elements into typed, sorted PlantNursery POIs
 */
function parseOverpassElements(elements: any[], originLat: number, originLng: number): PlantNursery[] {
  const results: PlantNursery[] = [];
  const seenCoords = new Set<string>();

  for (const el of elements) {
    const itemLat = el.lat ?? el.center?.lat;
    const itemLng = el.lon ?? el.center?.lon;
    if (itemLat == null || itemLng == null) continue;

    const coordKey = `${itemLat.toFixed(4)},${itemLng.toFixed(4)}`;
    if (seenCoords.has(coordKey)) continue;
    seenCoords.add(coordKey);

    const tags = el.tags || {};
    const name =
      tags.name ||
      tags['name:en'] ||
      tags.brand ||
      (tags.shop === 'garden_centre' ? 'Garden Centre & Nursery' : 'Plant Nursery');

    let address: string | undefined;
    if (tags['addr:full']) {
      address = tags['addr:full'];
    } else {
      const parts: string[] = [];
      if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
      if (tags['addr:street']) parts.push(tags['addr:street']);
      if (tags['addr:suburb']) parts.push(tags['addr:suburb']);
      if (tags['addr:city']) parts.push(tags['addr:city']);
      if (parts.length > 0) address = parts.join(', ');
    }

    const phone = tags.phone || tags['contact:phone'] || undefined;
    const openingHours = tags.opening_hours || undefined;
    const website = tags.website || tags['contact:website'] || undefined;
    const type: 'garden_centre' | 'plant_nursery' =
      tags.landuse === 'plant_nursery' || tags.shop === 'plant_nursery' || tags.shop === 'nursery'
        ? 'plant_nursery'
        : 'garden_centre';
    const distanceMeters = calculateDistanceMeters(originLat, originLng, itemLat, itemLng);

    results.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      coordinates: { lat: itemLat, lng: itemLng },
      address,
      phone,
      openingHours,
      website,
      type,
      distanceMeters,
    });
  }

  results.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
  return results;
}

const OVERPASS_ENDPOINTS = [
  'https://overpass.maprva.org/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

/**
 * Parse Geoapify Places API response into typed, sorted PlantNursery POIs
 * commercial.garden_centre -> type: garden_centre
 * commercial.florist -> type: plant_shop (distinctly labeled as flower & plant shop, not plant nursery)
 */
function parseGeoapifyFeatures(features: any[], originLat: number, originLng: number): PlantNursery[] {
  const results: PlantNursery[] = [];
  const seenCoords = new Set<string>();

  for (const feature of features) {
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const itemLat = typeof props.lat === 'number' ? props.lat : geom.coordinates?.[1];
    const itemLng = typeof props.lon === 'number' ? props.lon : geom.coordinates?.[0];

    if (itemLat == null || itemLng == null || isNaN(itemLat) || isNaN(itemLng)) continue;

    const coordKey = `${Number(itemLat).toFixed(4)},${Number(itemLng).toFixed(4)}`;
    if (seenCoords.has(coordKey)) continue;
    seenCoords.add(coordKey);

    const categories: string[] = Array.isArray(props.categories) ? props.categories : [];
    const isGardenCentre = categories.some((c: string) => c.includes('garden_centre'));

    // commercial.garden_centre -> garden_centre; commercial.florist -> plant_shop
    const type: 'garden_centre' | 'plant_shop' = isGardenCentre ? 'garden_centre' : 'plant_shop';

    const defaultName = isGardenCentre ? 'Garden Centre & Nursery' : 'Plant & Flower Shop';
    const name = props.name || props.address_line1 || defaultName;

    const address = props.formatted || props.address_line2 || undefined;
    const phone = props.contact?.phone || props.phone || undefined;
    const openingHours = props.opening_hours || undefined;
    const website = props.website || props.contact?.url || undefined;
    const distanceMeters =
      typeof props.distance === 'number'
        ? Math.round(props.distance)
        : calculateDistanceMeters(originLat, originLng, itemLat, itemLng);

    const placeId = props.place_id || `geoapify-${itemLat}-${itemLng}`;

    results.push({
      id: `geo-${placeId}`,
      name,
      coordinates: { lat: itemLat, lng: itemLng },
      address,
      phone,
      openingHours,
      website,
      type,
      distanceMeters,
    });
  }

  results.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
  return results;
}

/**
 * Query Geoapify Places API for plant nurseries and florists / plant shops
 */
async function fetchFromGeoapify(
  lat: number,
  lng: number,
  radiusMeters: number,
  apiKey: string
): Promise<PlantNursery[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '').trim();
    const url = `https://api.geoapify.com/v2/places?categories=commercial.garden_centre,commercial.florist&filter=circle:${encodeURIComponent(lng)},${encodeURIComponent(lat)},${encodeURIComponent(radiusMeters)}&bias=proximity:${encodeURIComponent(lng)},${encodeURIComponent(lat)}&limit=50&apiKey=${encodeURIComponent(cleanKey)}`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.features)) {
        return parseGeoapifyFeatures(data.features, lat, lng);
      }
    }
  } catch (_err) {
    // Gracefully fall back to Overpass mirrors if network fails
  }
  return [];
}

/**
 * Fallback to direct client-side query against public CORS-enabled Overpass API mirrors
 * Used when running on static hosting (e.g. Firebase Hosting) where /api/nurseries proxy is not available.
 */
async function fetchFromOverpassMirrors(
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<PlantNursery[]> {
  const query = `[out:json][timeout:20];(nw["landuse"="plant_nursery"](around:${radiusMeters},${lat},${lng});nw["shop"="garden_centre"](around:${radiusMeters},${lat},${lng});nw["shop"="plant_nursery"](around:${radiusMeters},${lat},${lng});nw["shop"="nursery"](around:${radiusMeters},${lat},${lng}););out center 40;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 16000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) continue;

      const data = await res.json();
      if (data && Array.isArray(data.elements)) {
        const parsed = parseOverpassElements(data.elements, lat, lng);
        if (parsed.length > 0 || data.elements.length === 0) {
          return parsed;
        }
      }
    } catch (_mirrorErr) {
      // Try next mirror
    }
  }

  return [];
}

/**
 * Fetch nearby plant nurseries from POIs
 * Tries the local proxy route first; falls back to Geoapify Places API (if configured), then Overpass.
 * @param lat Latitude of search origin
 * @param lng Longitude of search origin
 * @param radiusMeters Search radius in meters (default 25000)
 */
export async function fetchNearbyPlantNurseries(
  lat: number,
  lng: number,
  radiusMeters: number = 25000
): Promise<PlantNursery[]> {
  const clampedRadius = Math.max(1000, Math.min(radiusMeters, 50000));

  // 1. Try server-side proxy route first (active during Node/Express dev & full-stack deployment)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(
      `/api/nurseries?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(clampedRadius)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data && Array.isArray(data.nurseries) && data.nurseries.length > 0) {
        return data.nurseries;
      }
    }
  } catch (_proxyErr) {
    // Falls through to client API fallback
  }

  // 2. Client-side Geoapify Places API (when VITE_GEOAPIFY_API_KEY is configured)
  const rawGeoKey =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEOAPIFY_API_KEY) || '';
  const geoapifyKey = rawGeoKey.trim().replace(/^["']|["']$/g, '').trim();

  if (geoapifyKey && geoapifyKey !== 'MY_GEOAPIFY_API_KEY') {
    const geoResults = await fetchFromGeoapify(lat, lng, clampedRadius, geoapifyKey);
    if (geoResults.length > 0) {
      return geoResults;
    }
  }

  // 3. Direct CORS-enabled OpenStreetMap Overpass mirrors fallback
  return fetchFromOverpassMirrors(lat, lng, clampedRadius);
}
