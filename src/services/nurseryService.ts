/**
 * Plant Nursery POI Service
 * Fetches real, verified plant nurseries and garden centres across India using OpenStreetMap & Nominatim data.
 * Does not fabricate mock nursery locations.
 * Uses exact user GPS coordinates and filters results strictly within the specified radius.
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
  googleMapsDirectionsUrl: string;
}

// Calculate Haversine distance in meters
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
 * Generate a legitimate Google Maps directions URL from user coordinates to destination
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
 * Calculate bounding box [minLon, maxLat, maxLon, minLat] for Nominatim viewbox query
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
 * Parse Nominatim geocoding results into typed PlantNursery POIs
 * Strictly filters out preschools, kindergartens, daycares, non-plant shops, and items outside radiusMeters.
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

    // Reject schools, daycares, play schools, or kindergarten amenities often called "nursery school"
    if (item.class === 'amenity' || item.type === 'kindergarten' || item.type === 'school') {
      continue;
    }

    const nameRaw = (item.name || item.display_name?.split(',')?.[0] || '').trim();
    const lowerName = nameRaw.toLowerCase();

    // Check for school/childcare false positives in name
    if (
      lowerName.includes('school') ||
      lowerName.includes('preschool') ||
      lowerName.includes('kindergarten') ||
      lowerName.includes('creche') ||
      lowerName.includes('play school') ||
      lowerName.includes('child study') ||
      lowerName.includes('climbing')
    ) {
      continue;
    }

    // Deduplicate nearby nodes with same coordinates (within ~10m)
    const coordKey = `${itemLat.toFixed(4)},${itemLng.toFixed(4)}`;
    if (seenCoords.has(coordKey)) continue;
    seenCoords.add(coordKey);

    // Calculate exact distance in meters from user GPS coordinates
    const distanceMeters = calculateDistanceMeters(originLat, originLng, itemLat, itemLng);

    // Requirement 3 & 7: Do not display shops outside the selected radius
    if (distanceMeters > radiusMeters) {
      continue;
    }

    // Determine specific nursery / plant shop type
    let type: 'garden_centre' | 'plant_nursery' | 'plant_shop' = 'plant_nursery';
    if (item.type === 'garden_centre' || item.class === 'shop' && item.type === 'garden_centre') {
      type = 'garden_centre';
    } else if (item.type === 'florist' || lowerName.includes('florist') || lowerName.includes('flower')) {
      type = 'plant_shop';
    }

    // Build human-readable address from address object or display_name
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

    // Extract phone, opening hours, website from extratags if available
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

  results.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
  return results;
}

/**
 * Parse Geoapify Places API features into typed, sorted PlantNursery POIs
 */
export function parseGeoapifyFeatures(
  features: any[],
  originLat: number,
  originLng: number,
  radiusMeters: number
): PlantNursery[] {
  const results: PlantNursery[] = [];
  const seenCoords = new Set<string>();

  for (const feature of features) {
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const itemLat = typeof props.lat === 'number' ? props.lat : geom.coordinates?.[1];
    const itemLng = typeof props.lon === 'number' ? props.lon : geom.coordinates?.[0];

    if (itemLat == null || itemLng == null || isNaN(itemLat) || isNaN(itemLng)) continue;

    const distanceMeters =
      typeof props.distance === 'number'
        ? Math.round(props.distance)
        : calculateDistanceMeters(originLat, originLng, itemLat, itemLng);

    // Filter strictly within radius
    if (distanceMeters > radiusMeters) continue;

    const coordKey = `${Number(itemLat).toFixed(4)},${Number(itemLng).toFixed(4)}`;
    if (seenCoords.has(coordKey)) continue;
    seenCoords.add(coordKey);

    const categories: string[] = Array.isArray(props.categories) ? props.categories : [];
    const isGardenCentre = categories.some((c: string) => c.includes('garden_centre'));
    const type: 'garden_centre' | 'plant_shop' = isGardenCentre ? 'garden_centre' : 'plant_shop';

    const defaultName = isGardenCentre ? 'Garden Centre & Nursery' : 'Plant & Flower Shop';
    const name = props.name || props.address_line1 || defaultName;
    const address = props.formatted || props.address_line2 || undefined;
    const phone = props.contact?.phone || props.phone || undefined;
    const openingHours = props.opening_hours || undefined;
    const website = props.website || props.contact?.url || undefined;
    const placeId = props.place_id || `geoapify-${itemLat}-${itemLng}`;

    const googleMapsDirectionsUrl = buildGoogleMapsDirectionsUrl(
      originLat,
      originLng,
      itemLat,
      itemLng,
      name
    );

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
      googleMapsDirectionsUrl,
    });
  }

  results.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
  return results;
}

/**
 * Direct client-side Nominatim search for plant nurseries and garden centres within the bounding box
 */
async function fetchFromClientNominatim(
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<PlantNursery[]> {
  const bbox = calculateBoundingBox(lat, lng, radiusMeters);
  const viewboxStr = `${bbox.minLon},${bbox.maxLat},${bbox.maxLon},${bbox.minLat}`;

  const queries = ['garden centre', 'plant nursery', 'plant shop'];
  const allResults: PlantNursery[] = [];
  const seenIds = new Set<string>();

  for (const q of queries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        q
      )}&format=json&limit=50&viewbox=${viewboxStr}&bounded=1&addressdetails=1&extratags=1`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'WhereIsMyPlant/1.0 (Botanical Discovery App)',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
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

  allResults.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
  return allResults;
}

/**
 * Fetch real nearby plant nurseries & plant shops within the selected radius around the user's GPS position.
 * Tries server proxy /api/nurseries first, then client-side Nominatim POI search.
 * @param lat User GPS Latitude
 * @param lng User GPS Longitude
 * @param radiusMeters Search radius in meters (5 km, 10 km, 25 km, 50 km)
 */
export async function fetchNearbyPlantNurseries(
  lat: number,
  lng: number,
  radiusMeters: number = 10000
): Promise<PlantNursery[]> {
  // Support radius options: 5 km, 10 km, 25 km, 50 km (clamped between 5000 and 50000 meters)
  const clampedRadius = Math.max(5000, Math.min(radiusMeters, 50000));

  // 1. Try server-side proxy route first (/api/nurseries)
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
        // Ensure every item has a valid googleMapsDirectionsUrl and distance strictly within clampedRadius
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
    // Falls through to client-side Nominatim query
  }

  // 2. Client-side Nominatim POI query fallback
  return fetchFromClientNominatim(lat, lng, clampedRadius);
}
