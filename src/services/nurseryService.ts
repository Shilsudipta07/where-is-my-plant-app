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
  type: 'garden_centre' | 'plant_nursery';
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
 * Fetch nearby plant nurseries from OpenStreetMap POIs
 * Tries the local proxy route first; falls back to public CORS-enabled Overpass endpoints if unavailable.
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
      if (data && Array.isArray(data.nurseries)) {
        return data.nurseries;
      }
    }
  } catch (_proxyErr) {
    // Falls through to direct Overpass mirrors
  }

  // 2. Direct CORS-enabled OpenStreetMap Overpass mirrors fallback (for static Firebase Hosting)
  return fetchFromOverpassMirrors(lat, lng, clampedRadius);
}
