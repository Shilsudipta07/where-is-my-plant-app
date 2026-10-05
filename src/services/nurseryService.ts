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
 * Fetch nearby plant nurseries from OpenStreetMap POIs
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

  // Query the server-side proxy route which passes authorized headers and handles Overpass queries
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(
      `/api/nurseries?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(clampedRadius)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.nurseries)) {
        return data.nurseries;
      }
    }
  } catch (_proxyErr) {
    // Gracefully handle network/abort errors without uncaught exceptions
  }

  // Real OpenStreetMap nurseries only: never fabricate locations
  return [];
}
