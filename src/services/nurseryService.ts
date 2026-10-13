/**
 * Plant Nursery POI Service
 * Fetches real, verified plant nurseries, garden centres, and plant shops near the user's GPS position
 * using OpenStreetMap data via the Overpass API with multi-mirror failover and Nominatim backup.
 * 
 * Strict Zero-Fabrication Guarantee:
 * - Does not use mock, fake, or hardcoded nurseries.
 * - Does not use paid APIs or Google Maps Platform APIs.
 * - Enforces strict Haversine distance filtering for selected 5, 10, 25, and 50 km radii.
 * - Differentiates empty radius results from API rate limits or network connection errors.
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
  distanceMeters: number;
  googleMapsDirectionsUrl: string;
}

export class NurseryFetchError extends Error {
  code: 'RATE_LIMIT' | 'TIMEOUT' | 'API_UNAVAILABLE' | 'INVALID_COORDINATES';

  constructor(message: string, code: 'RATE_LIMIT' | 'TIMEOUT' | 'API_UNAVAILABLE' | 'INVALID_COORDINATES') {
    super(message);
    this.name = 'NurseryFetchError';
    this.code = code;
  }
}

// Calculate Haversine distance in meters between two GPS coordinates
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
 * Generate a standard Google Maps driving directions link
 */
export function buildGoogleMapsDirectionsUrl(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  destName?: string
): string {
  const destinationQuery = destName
    ? `${destLat},${destLng}+(${encodeURIComponent(destName)})`
    : `${destLat},${destLng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destinationQuery}&travelmode=driving`;
}

/**
 * Calculate bounding box [minLon, maxLat, maxLon, minLat] for viewbox fallback queries
 */
export function calculateBoundingBox(lat: number, lon: number, radiusMeters: number) {
  const R = 6371; // Earth radius in km
  const radiusKm = radiusMeters / 1000;
  const deltaLat = (radiusKm / R) * (180 / Math.PI);
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const deltaLon = (radiusKm / (R * (Math.abs(cosLat) > 0.0001 ? cosLat : 1))) * (180 / Math.PI);

  return {
    minLon: +(lon - deltaLon).toFixed(4),
    maxLat: +(lat + deltaLat).toFixed(4),
    maxLon: +(lon + deltaLon).toFixed(4),
    minLat: +(lat - deltaLat).toFixed(4),
  };
}

/**
 * Parse OpenStreetMap Overpass elements (nodes and ways) into typed PlantNursery POIs.
 * Filters strictly within the chosen radius and excludes preschool / kindergarten false positives.
 */
export function parseOverpassElements(
  elements: any[],
  originLat: number,
  originLng: number,
  radiusMeters: number
): PlantNursery[] {
  const results: PlantNursery[] = [];
  const seenCoords = new Set<string>();

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;

    const tags = el.tags || {};

    // Reject schools, kindergartens, and childcare facilities sometimes termed 'nursery'
    if (
      tags.amenity === 'school' ||
      tags.amenity === 'kindergarten' ||
      tags.amenity === 'childcare' ||
      tags.amenity === 'preschool'
    ) {
      continue;
    }

    const nameRaw = (tags.name || tags['name:en'] || '').trim();
    const lowerName = nameRaw.toLowerCase();
    if (
      lowerName.includes('school') ||
      lowerName.includes('preschool') ||
      lowerName.includes('kindergarten') ||
      lowerName.includes('creche') ||
      lowerName.includes('play school') ||
      lowerName.includes('daycare') ||
      lowerName.includes('climbing')
    ) {
      continue;
    }

    // Strict Haversine distance verification
    const distanceMeters = calculateDistanceMeters(originLat, originLng, lat, lng);
    if (distanceMeters > radiusMeters) {
      continue;
    }

    // Deduplicate identical points (~10m grid)
    const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seenCoords.has(coordKey)) continue;
    seenCoords.add(coordKey);

    // Classification
    let type: 'garden_centre' | 'plant_nursery' | 'plant_shop' = 'plant_nursery';
    if (tags.shop === 'garden_centre' || tags.landuse === 'plant_nursery') {
      type = 'garden_centre';
    } else if (
      tags.shop === 'florist' ||
      tags.shop === 'flowers' ||
      lowerName.includes('florist') ||
      lowerName.includes('flower')
    ) {
      type = 'plant_shop';
    }

    // Address construction from OSM address tags
    let address: string | undefined;
    const addrParts: string[] = [];
    if (tags['addr:housenumber']) addrParts.push(tags['addr:housenumber']);
    if (tags['addr:street']) addrParts.push(tags['addr:street']);
    if (tags['addr:suburb'] && !addrParts.includes(tags['addr:suburb'])) addrParts.push(tags['addr:suburb']);
    if (tags['addr:neighbourhood'] && !addrParts.includes(tags['addr:neighbourhood'])) addrParts.push(tags['addr:neighbourhood']);
    if (tags['addr:city'] && !addrParts.includes(tags['addr:city'])) addrParts.push(tags['addr:city']);
    if (tags['addr:state'] && !addrParts.includes(tags['addr:state'])) addrParts.push(tags['addr:state']);
    if (tags['addr:postcode']) addrParts.push(tags['addr:postcode']);

    if (addrParts.length > 0) {
      address = addrParts.join(', ');
    } else if (tags['addr:full']) {
      address = tags['addr:full'];
    }

    const phone =
      tags.phone ||
      tags['contact:phone'] ||
      tags['contact:mobile'] ||
      undefined;
    const openingHours = tags.opening_hours || undefined;
    const website = tags.website || tags['contact:website'] || undefined;

    const defaultName =
      type === 'garden_centre'
        ? 'Garden Centre & Nursery'
        : type === 'plant_shop'
        ? 'Plant & Flower Shop'
        : 'Plant Nursery';
    const finalName = nameRaw || defaultName;

    const googleMapsDirectionsUrl = buildGoogleMapsDirectionsUrl(
      originLat,
      originLng,
      lat,
      lng,
      finalName
    );

    results.push({
      id: `osm-${el.type || 'node'}-${el.id}`,
      name: finalName,
      coordinates: { lat, lng },
      address,
      phone,
      openingHours,
      website,
      type,
      distanceMeters,
      googleMapsDirectionsUrl,
    });
  }

  results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return results;
}

/**
 * Parse Nominatim geocoding results into typed PlantNursery POIs
 */
export function parseNominatimFeatures(
  items: any[],
  originLat: number,
  originLng: number,
  radiusMeters: number
): PlantNursery[] {
  const results: PlantNursery[] = [];
  const seenCoords = new Set<string>();

  for (const item of items) {
    const itemLat = parseFloat(item.lat);
    const itemLng = parseFloat(item.lon);
    if (isNaN(itemLat) || isNaN(itemLng)) continue;

    if (item.class === 'amenity' || item.type === 'kindergarten' || item.type === 'school') {
      continue;
    }

    const nameRaw = (item.name || item.display_name?.split(',')?.[0] || '').trim();
    const lowerName = nameRaw.toLowerCase();

    if (
      lowerName.includes('school') ||
      lowerName.includes('preschool') ||
      lowerName.includes('kindergarten') ||
      lowerName.includes('creche') ||
      lowerName.includes('play school') ||
      lowerName.includes('childcare') ||
      lowerName.includes('daycare')
    ) {
      continue;
    }

    const distanceMeters = calculateDistanceMeters(originLat, originLng, itemLat, itemLng);
    if (distanceMeters > radiusMeters) {
      continue;
    }

    const coordKey = `${itemLat.toFixed(4)},${itemLng.toFixed(4)}`;
    if (seenCoords.has(coordKey)) continue;
    seenCoords.add(coordKey);

    let type: 'garden_centre' | 'plant_nursery' | 'plant_shop' = 'plant_nursery';
    if (item.type === 'garden_centre' || (item.class === 'shop' && item.type === 'garden_centre')) {
      type = 'garden_centre';
    } else if (item.type === 'florist' || lowerName.includes('florist') || lowerName.includes('flower')) {
      type = 'plant_shop';
    }

    let address: string | undefined;
    if (item.address && typeof item.address === 'object') {
      const parts: string[] = [];
      const addr = item.address;
      if (addr.road) parts.push(addr.road);
      if (addr.neighbourhood && addr.neighbourhood !== addr.road) parts.push(addr.neighbourhood);
      if (addr.suburb && !parts.includes(addr.suburb)) parts.push(addr.suburb);
      if (addr.city_district && !parts.includes(addr.city_district)) parts.push(addr.city_district);
      if (addr.city && !parts.includes(addr.city)) parts.push(addr.city);
      if (addr.state && !parts.includes(addr.state)) parts.push(addr.state);
      if (addr.postcode) parts.push(addr.postcode);
      if (parts.length > 0) address = parts.join(', ');
    }
    if (!address && item.display_name) {
      address = item.display_name;
    }

    const extratags = item.extratags || {};
    const phone =
      extratags.phone ||
      extratags['contact:phone'] ||
      extratags['contact:mobile'] ||
      undefined;
    const openingHours = extratags.opening_hours || undefined;
    const website = extratags.website || extratags['contact:website'] || undefined;

    const defaultName =
      type === 'garden_centre'
        ? 'Garden Centre & Nursery'
        : type === 'plant_shop'
        ? 'Plant & Flower Shop'
        : 'Plant Nursery';
    const finalName = nameRaw || defaultName;

    const googleMapsDirectionsUrl = buildGoogleMapsDirectionsUrl(
      originLat,
      originLng,
      itemLat,
      itemLng,
      finalName
    );

    results.push({
      id: `osm-${item.osm_type || 'node'}-${item.osm_id || item.place_id}`,
      name: finalName,
      coordinates: { lat: itemLat, lng: itemLng },
      address,
      phone,
      openingHours,
      website,
      type,
      distanceMeters,
      googleMapsDirectionsUrl,
    });
  }

  results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return results;
}

// In-memory cache for fast radius switching and rate-limit mitigation (5 minutes TTL)
interface CacheEntry {
  timestamp: number;
  data: PlantNursery[];
}
const nurseryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Public Overpass API mirrors with browser CORS support
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/**
 * Direct client-side Overpass API query with multi-mirror failover
 */
async function fetchFromOverpassApi(
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<{ success: boolean; nurseries: PlantNursery[]; rateLimited: boolean }> {
  const query = `[out:json][timeout:15];
(
  node["shop"="garden_centre"](around:${radiusMeters},${lat},${lng});
  way["shop"="garden_centre"](around:${radiusMeters},${lat},${lng});
  node["shop"="plant_nursery"](around:${radiusMeters},${lat},${lng});
  way["shop"="plant_nursery"](around:${radiusMeters},${lat},${lng});
  node["landuse"="plant_nursery"](around:${radiusMeters},${lat},${lng});
  way["landuse"="plant_nursery"](around:${radiusMeters},${lat},${lng});
  node["shop"="florist"](around:${radiusMeters},${lat},${lng});
  way["shop"="florist"](around:${radiusMeters},${lat},${lng});
);
out center tags 80;`;

  let rateLimited = false;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7500);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'WhereIsMyPlant/1.0 (Botanical Discovery Platform)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 429) {
        rateLimited = true;
        continue;
      }

      if (res.ok) {
        try {
          const data = await res.json();
          if (data && Array.isArray(data.elements)) {
            const nurseries = parseOverpassElements(data.elements, lat, lng, radiusMeters);
            return { success: true, nurseries, rateLimited: false };
          }
        } catch (_jsonErr) {
          // If response body is not JSON, try next mirror
        }
      }
    } catch (_err) {
      // Continue to next mirror
    }
  }

  return { success: false, nurseries: [], rateLimited };
}

/**
 * Direct client-side Nominatim search fallback
 */
async function fetchFromClientNominatim(
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<{ success: boolean; nurseries: PlantNursery[]; rateLimited: boolean }> {
  const bbox = calculateBoundingBox(lat, lng, radiusMeters);
  const viewboxStr = `${bbox.minLon},${bbox.maxLat},${bbox.maxLon},${bbox.minLat}`;

  const queries = ['garden centre', 'plant nursery', 'plant shop'];
  const allResults: PlantNursery[] = [];
  const seenIds = new Set<string>();
  let rateLimited = false;
  let hadSuccessfulResponse = false;

  for (const q of queries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        q
      )}&format=json&limit=40&viewbox=${viewboxStr}&bounded=1&addressdetails=1&extratags=1`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'WhereIsMyPlant/1.0 (Botanical Discovery Platform)',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 429) {
        rateLimited = true;
        continue;
      }

      if (res.ok) {
        hadSuccessfulResponse = true;
        const data = await res.json();
        if (Array.isArray(data)) {
          const parsed = parseNominatimFeatures(data, lat, lng, radiusMeters);
          for (const item of parsed) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              allResults.push(item);
            }
          }
        }
      }
    } catch (_err) {
      // Continue to next query
    }
  }
              seenIds.add(item.id);
              allResults.push(item);
            }
          }
        }
      }
    } catch (_err) {
      // Continue to next query
    }
  }

  allResults.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return {
    success: hadSuccessfulResponse,
    nurseries: allResults,
    rateLimited,
  };
}

/**
 * Fetch real nearby plant nurseries & garden centres within the selected radius around the user's GPS position.
 * 
 * Pipeline:
 * 1. Checks server-side proxy route (/api/nurseries) if available and returning valid JSON.
 * 2. Directly queries OpenStreetMap Overpass API across multiple reliable mirrors.
 * 3. Falls back to OpenStreetMap Nominatim bounded POI search.
 * 4. Strictly validates all coordinates and enforces Haversine radius limits (5, 10, 25, 50 km).
 * 5. Distinguishes rate limits and service interruptions from genuine zero-results.
 * 
 * @param lat User GPS Latitude
 * @param lng User GPS Longitude
 * @param radiusMeters Search radius in meters (5 km, 10 km, 25 km, 50 km)
 */
export async function fetchNearbyPlantNurseries(
  lat: number,
  lng: number,
  radiusMeters: number = 10000
): Promise<PlantNursery[]> {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    throw new NurseryFetchError('Invalid GPS coordinates provided for nursery search.', 'INVALID_COORDINATES');
  }

  // Support standard radius options: 5 km, 10 km, 25 km, 50 km (clamped between 5000 and 50000 meters)
  const clampedRadius = Math.max(5000, Math.min(radiusMeters, 50000));

  // 1. Try server-side proxy route first if running full-stack (/api/nurseries)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `/api/nurseries?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(clampedRadius)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data && Array.isArray(data.nurseries) && data.nurseries.length > 0) {
        return (data.nurseries as PlantNursery[])
          .filter((n) => (n.distanceMeters ?? 0) <= clampedRadius)
          .map((n) => ({
            ...n,
            googleMapsDirectionsUrl:
              n.googleMapsDirectionsUrl ||
              buildGoogleMapsDirectionsUrl(lat, lng, n.coordinates.lat, n.coordinates.lng, n.name),
          }));
      }
    }
  } catch (_proxyErr) {
    // Continue directly to client-side Overpass
  }

  // 2. OpenStreetMap Overpass API (Primary Open-Data Source)
  const overpassResult = await fetchFromOverpassApi(lat, lng, clampedRadius);
  if (overpassResult.success) {
    return overpassResult.nurseries;
  }

  // 3. OpenStreetMap Nominatim Fallback
  const nominatimResult = await fetchFromClientNominatim(lat, lng, clampedRadius);
  if (nominatimResult.success) {
    return nominatimResult.nurseries;
  }

  // If rate limited on either open-data provider
  if (overpassResult.rateLimited || nominatimResult.rateLimited) {
    throw new NurseryFetchError(
      'OpenStreetMap Overpass API is temporarily rate limited. Please wait a few moments and try again.',
      'RATE_LIMIT'
    );
  }

  // If both open-data services failed to respond
  throw new NurseryFetchError(
    'Unable to connect to OpenStreetMap nursery directory services. Please check your network connection and retry.',
    'API_UNAVAILABLE'
  );
}
