import { Coordinates } from '../types/plant';

/**
 * Calculates great-circle distance between two geographic coordinates using Haversine formula.
 * Returns distance in kilometers.
 */
export function calculateDistanceKm(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371; // Earth's radius in kilometres
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const lat1 = (coord1.lat * Math.PI) / 180;
  const lat2 = (coord2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats distance nicely for student UI (meters or kilometers)
 */
export function formatDistance(coord1: Coordinates, coord2: Coordinates): string {
  const km = calculateDistanceKm(coord1, coord2);
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return `${meters} m away`;
  }
  return `${km.toFixed(1)} km away`;
}

/**
 * Calculates initial compass bearing from start coordinates to destination coordinates.
 * Returns bearing in degrees (0-359°) and corresponding cardinal direction abbreviation.
 */
export function calculateBearing(
  start: Coordinates,
  dest: Coordinates
): { degrees: number; cardinal: string } {
  const lat1 = (start.lat * Math.PI) / 180;
  const lat2 = (dest.lat * Math.PI) / 180;
  const dLng = ((dest.lng - start.lng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  const degrees = Math.round((brng + 360) % 360);

  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return { degrees, cardinal: cardinals[index] };
}

