/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GeocodingResult {
  placeId: string;
  displayName: string;
  shortName: string;
  lat: number;
  lng: number;
}

/**
 * Searches real-world places, addresses, landmarks, and botanical gardens
 * using OpenStreetMap Nominatim with Photon fallback.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal
): Promise<GeocodingResult[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {
    return [];
  }

  // 1. Try OpenStreetMap Nominatim
  try {
    const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      trimmed
    )}&limit=6&addressdetails=1`;

    const res = await fetch(endpoint, {
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WhereIsMyPlant/1.0 (Botanical Survey Platform; contact@whereismyplant.app)',
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((item: any) => {
          const address = item.address || {};
          const primary =
            address.amenity ||
            address.building ||
            address.road ||
            address.park ||
            address.suburb ||
            address.village ||
            address.town ||
            address.city ||
            item.name ||
            item.display_name.split(',')[0];

          const secondaryParts: string[] = [];
          if (address.city && address.city !== primary) secondaryParts.push(address.city);
          else if (address.town && address.town !== primary) secondaryParts.push(address.town);
          else if (address.state && address.state !== primary) secondaryParts.push(address.state);

          if (address.country) secondaryParts.push(address.country);

          const shortName = secondaryParts.length > 0 ? `${primary}, ${secondaryParts.join(', ')}` : primary;

          return {
            placeId: String(item.place_id || `${item.lat}-${item.lon}`),
            displayName: item.display_name,
            shortName,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          };
        });
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') return [];
  }

  // 2. Fallback to Photon (Komoot OSM Geocoder) if Nominatim is busy or blocked
  try {
    const photonEndpoint = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=6`;
    const pRes = await fetch(photonEndpoint, { signal });
    if (pRes.ok) {
      const pData = await pRes.json();
      if (pData && Array.isArray(pData.features)) {
        return pData.features.map((feat: any) => {
          const props = feat.properties || {};
          const coords = feat.geometry?.coordinates || [0, 0];
          const name = props.name || props.street || props.city || trimmed;
          const details = [props.city, props.state, props.country].filter(Boolean).filter((s: string) => s !== name);
          const shortName = details.length > 0 ? `${name}, ${details.join(', ')}` : name;
          return {
            placeId: String(props.osm_id || `${coords[1]}-${coords[0]}`),
            displayName: shortName,
            shortName,
            lat: coords[1],
            lng: coords[0],
          };
        });
      }
    }
  } catch (pErr: any) {
    if (pErr.name === 'AbortError') return [];
    console.warn('[GeocodingService] Place search fallback failed:', pErr);
  }

  return [];
}

/**
 * Reverse geocodes geographic coordinates into a human-readable location name
 * (e.g., street, park, neighborhood, city).
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<string | null> {
  if (isNaN(lat) || isNaN(lng)) return null;

  // 1. Try OpenStreetMap Nominatim
  try {
    const endpoint = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(endpoint, {
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WhereIsMyPlant/1.0 (Botanical Survey Platform; contact@whereismyplant.app)',
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.display_name) {
        const address = data.address || {};
        const parts: string[] = [];

        if (address.park) parts.push(address.park);
        else if (address.amenity) parts.push(address.amenity);
        else if (address.road) parts.push(address.road);
        else if (address.suburb) parts.push(address.suburb);
        else if (address.neighbourhood) parts.push(address.neighbourhood);

        if (address.city) parts.push(address.city);
        else if (address.town) parts.push(address.town);
        else if (address.village) parts.push(address.village);
        else if (address.county) parts.push(address.county);

        if (address.country) parts.push(address.country);

        if (parts.length > 0) {
          return parts.slice(0, 3).join(', ');
        }
        return data.display_name.split(',').slice(0, 3).join(',').trim();
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') return null;
  }

  // 2. Fallback to Photon Reverse Geocoding
  try {
    const photonEndpoint = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
    const pRes = await fetch(photonEndpoint, { signal });
    if (pRes.ok) {
      const pData = await pRes.json();
      if (pData && Array.isArray(pData.features) && pData.features.length > 0) {
        const props = pData.features[0].properties || {};
        const name = props.name || props.street || props.suburb || props.district;
        const city = props.city || props.town || props.village;
        const country = props.country;
        const parts = [name, city, country].filter(Boolean);
        if (parts.length > 0) {
          return parts.join(', ');
        }
      }
    }
  } catch (pErr: any) {
    if (pErr.name === 'AbortError') return null;
  }

  return null;
}
