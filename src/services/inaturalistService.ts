/**
 * iNaturalist API Service
 * 
 * Public API client for iNaturalist botanical observations and taxa matching.
 * Reference: https://api.inaturalist.org/v1/docs/
 */

export interface INaturalistTaxon {
  id: number;
  name: string;
  preferred_common_name?: string;
  rank?: string;
  iconic_taxon_name?: string;
  default_photo?: {
    medium_url?: string;
    square_url?: string;
    url?: string;
  };
}

export interface INaturalistObservationRecord {
  id: string;
  observationId: number;
  scientificName: string;
  commonName?: string;
  taxonId?: number;
  coordinates: {
    lat: number;
    lng: number;
  };
  eventDate?: string;
  locality: string;
  imageUrl?: string;
  observationUrl: string;
  userLogin?: string;
  qualityGrade?: string;
}

const INAT_BASE = 'https://api.inaturalist.org/v1';
const PLANTAE_TAXON_ID = 47126;

function parseINatRecord(obs: any): INaturalistObservationRecord | null {
  if (!obs.geojson || !obs.geojson.coordinates || obs.geojson.coordinates.length < 2) {
    return null;
  }
  const lng = obs.geojson.coordinates[0];
  const lat = obs.geojson.coordinates[1];

  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return null;
  }

  const taxon = obs.taxon || {};
  let imageUrl = obs.photos?.[0]?.url || taxon.default_photo?.medium_url || taxon.default_photo?.url;
  if (imageUrl) {
    imageUrl = imageUrl.replace('square.', 'medium.');
  }

  const dateStr = obs.observed_on_details?.date || obs.observed_on || (obs.time_observed_at ? obs.time_observed_at.split('T')[0] : undefined);

  return {
    id: `inat-${obs.id}`,
    observationId: obs.id,
    scientificName: taxon.name || 'Botanical observation',
    commonName: taxon.preferred_common_name,
    taxonId: taxon.id,
    coordinates: { lat, lng },
    eventDate: dateStr,
    locality: obs.place_guess || 'Georeferenced observation',
    imageUrl,
    observationUrl: obs.uri || `https://www.inaturalist.org/observations/${obs.id}`,
    userLogin: obs.user?.login,
    qualityGrade: obs.quality_grade,
  };
}

/**
 * Searches taxa on iNaturalist restricted to Kingdom Plantae.
 */
export async function searchINaturalistTaxa(query: string): Promise<INaturalistTaxon[]> {
  const clean = query.trim();
  if (!clean) return [];

  const url = `${INAT_BASE}/taxa?q=${encodeURIComponent(clean)}&taxon_id=${PLANTAE_TAXON_ID}&per_page=10`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`iNaturalist API error: ${res.statusText}`);
  }
  const data = await res.json();
  return (data.results || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    preferred_common_name: t.preferred_common_name,
    rank: t.rank,
    iconic_taxon_name: t.iconic_taxon_name,
    default_photo: t.default_photo,
  }));
}

/**
 * Fetches public georeferenced observations for a taxon.
 */
export async function fetchObservationsByTaxon(
  taxonId: number,
  limit: number = 60
): Promise<INaturalistObservationRecord[]> {
  const url = `${INAT_BASE}/observations?taxon_id=${taxonId}&has[]=photos&has[]=geo&per_page=${Math.min(limit, 100)}&order=desc&order_by=votes`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`iNaturalist API error: ${res.statusText}`);
  }
  const data = await res.json();
  const results = (data.results || []).map(parseINatRecord).filter((r: any): r is INaturalistObservationRecord => r !== null);
  return results;
}

/**
 * Fetches nearby plant observations around given coordinates.
 */
export async function fetchNearbyPlantObservations(
  lat: number,
  lng: number,
  radiusKm: number = 10,
  options: { limit?: number } = {}
): Promise<INaturalistObservationRecord[]> {
  const limit = options.limit || 60;
  const url = `${INAT_BASE}/observations?lat=${lat}&lng=${lng}&radius=${radiusKm}&iconic_taxa=Plantae&has[]=photos&has[]=geo&per_page=${limit}&order=desc&order_by=observed_on`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`iNaturalist API error: ${res.statusText}`);
  }
  const data = await res.json();
  return (data.results || []).map(parseINatRecord).filter((r: any): r is INaturalistObservationRecord => r !== null);
}

/**
 * Searches plant observations matching query text, returning matched taxon and observations.
 */
export async function searchPlantObservations(
  query: string,
  userLocation?: { lat: number; lng: number } | null,
  radiusKm?: number | 'all'
): Promise<{ taxon: INaturalistTaxon | null; observations: INaturalistObservationRecord[] }> {
  const clean = query.trim();
  if (!clean) return { taxon: null, observations: [] };

  try {
    // 1. Resolve Taxon first
    const taxa = await searchINaturalistTaxa(clean);
    if (taxa.length === 0) {
      return { taxon: null, observations: [] };
    }

    const primaryTaxon = taxa[0];

    // 2. Fetch observations
    let url = `${INAT_BASE}/observations?taxon_id=${primaryTaxon.id}&has[]=photos&has[]=geo&per_page=60&order=desc&order_by=votes`;
    if (userLocation && typeof radiusKm === 'number') {
      url += `&lat=${userLocation.lat}&lng=${userLocation.lng}&radius=${radiusKm}`;
    }

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return { taxon: primaryTaxon, observations: [] };
    }

    const data = await res.json();
    const observations = (data.results || [])
      .map(parseINatRecord)
      .filter((r: any): r is INaturalistObservationRecord => r !== null);

    return { taxon: primaryTaxon, observations };
  } catch (err) {
    console.error('[iNaturalistService] searchPlantObservations error:', err);
    return { taxon: null, observations: [] };
  }
}
