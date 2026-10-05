/**
 * GBIF (Global Biodiversity Information Facility) API Service
 *
 * Direct integration with official GBIF REST APIs:
 * 1. Species match: https://api.gbif.org/v1/species/match?name=QUERY&kingdom=Plantae
 * 2. Species search: https://api.gbif.org/v1/species/search (Backbone Taxonomy)
 * 3. Occurrence search: https://api.gbif.org/v1/occurrence/search
 *
 * Public APIs - No secret keys required.
 * Reference: https://techdocs.gbif.org/en/openapi/
 */

export interface GbifSpeciesMatch {
  usageKey?: number;
  acceptedUsageKey?: number;
  scientificName?: string;
  canonicalName?: string;
  rank?: string;
  status?: string;
  confidence?: number;
  matchType?: 'EXACT' | 'FUZZY' | 'HIGHERRANK' | 'NONE';
  kingdom?: string;
  phylum?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
  speciesKey?: number;
  synonym?: boolean;
  alternatives?: Array<{
    usageKey: number;
    scientificName: string;
    canonicalName?: string;
    rank?: string;
    status?: string;
    confidence?: number;
    family?: string;
  }>;
}

export interface GbifTaxonomyDetails {
  scientificName?: string;
  canonicalName?: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
  rank?: string;
  taxonKey?: number;
  gbifUrl?: string;
}

/**
 * Fetches comprehensive taxonomic hierarchy from GBIF for a given scientific or common name.
 * 1. Queries species match API with kingdom=Plantae
 * 2. If valid match, returns the exact taxonomic hierarchy (Kingdom, Phylum, Class, Order, Family, Genus, Species, Rank)
 * 3. Never invents missing fields.
 */
export async function fetchGbifTaxonomyDetails(
  plantNameOrScientific: string
): Promise<GbifTaxonomyDetails | null> {
  const clean = plantNameOrScientific.trim();
  if (!clean) return null;

  // Use bridge if common name exists
  const lower = clean.toLowerCase();
  const knownMapping = COMMON_TO_SCIENTIFIC_MAP[lower];
  const queryToUse = knownMapping ? knownMapping.scientific : clean;

  try {
    const encoded = encodeURIComponent(queryToUse);
    const url = `https://api.gbif.org/v1/species/match?name=${encoded}&kingdom=Plantae&verbose=true`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const data: GbifSpeciesMatch = await res.json();
    const matchType = data.matchType || 'NONE';
    const taxonKey = data.acceptedUsageKey || data.usageKey || data.speciesKey;

    if (matchType !== 'NONE' && taxonKey && data.rank !== 'KINGDOM' && taxonKey !== PLANTAE_KINGDOM_KEY) {
      // Optional: fetch species object directly for complete class/phylum if not in match response
      let phylum = data.phylum;
      let className = (data as any).class || (data as any).clazz;
      let order = data.order;
      let kingdom = data.kingdom || 'Plantae';
      let family = data.family;
      let genus = data.genus;
      let species = data.species;
      let rank = data.rank;
      let scientificName = data.scientificName || data.canonicalName || queryToUse;
      let canonicalName = data.canonicalName;

      // If class or phylum is missing, fetch /species/{key}
      if (!className || !phylum) {
        try {
          const detailRes = await fetch(`https://api.gbif.org/v1/species/${taxonKey}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            phylum = detailData.phylum || phylum;
            className = detailData.class || className;
            order = detailData.order || order;
            family = detailData.family || family;
            genus = detailData.genus || genus;
            species = detailData.species || species;
            rank = detailData.rank || rank;
            scientificName = detailData.scientificName || scientificName;
            canonicalName = detailData.canonicalName || canonicalName;
          }
        } catch {
          // ignore secondary fetch failure
        }
      }

      return {
        taxonKey,
        scientificName,
        canonicalName,
        kingdom,
        phylum,
        class: className,
        order,
        family,
        genus,
        species,
        rank,
        gbifUrl: `https://www.gbif.org/species/${taxonKey}`,
      };
    }

    // Fallback: search backbone taxonomy
    const searchUrl = `https://api.gbif.org/v1/species/search?datasetKey=${GBIF_BACKBONE_DATASET_KEY}&highertaxonKey=${PLANTAE_KINGDOM_KEY}&limit=5&q=${encodeURIComponent(clean)}`;
    const searchRes = await fetch(searchUrl, { headers: { Accept: 'application/json' } });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.results && Array.isArray(searchData.results) && searchData.results.length > 0) {
        const match = searchData.results.find(
          (r: any) => r.key !== PLANTAE_KINGDOM_KEY && r.rank !== 'KINGDOM'
        );
        if (match) {
          const key = match.key || match.nubKey;
          return {
            taxonKey: key,
            scientificName: match.scientificName,
            canonicalName: match.canonicalName,
            kingdom: match.kingdom || 'Plantae',
            phylum: match.phylum,
            class: match.class,
            order: match.order,
            family: match.family,
            genus: match.genus,
            species: match.species,
            rank: match.rank,
            gbifUrl: `https://www.gbif.org/species/${key}`,
          };
        }
      }
    }

    return null;
  } catch (e) {
    console.warn('[GBIF API] Could not fetch taxonomy details:', e);
    return null;
  }
}

export interface GbifOccurrenceItem {
  key: number;
  scientificName: string;
  acceptedScientificName?: string;
  decimalLatitude: number;
  decimalLongitude: number;
  eventDate?: string;
  year?: number;
  month?: number;
  day?: number;
  country?: string;
  stateProvince?: string;
  locality?: string;
  basisOfRecord?: string;
  datasetName?: string;
  occurrenceID?: string;
  references?: string;
  coordinateUncertaintyInMeters?: number;
  vernacularName?: string;
  family?: string;
  media?: Array<{
    type?: string;
    format?: string;
    identifier?: string;
    [key: string]: any;
  }>;
}

export interface PlantOccurrenceRecord {
  id: string;
  gbifKey: number;
  scientificName: string;
  commonName?: string;
  family: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  eventDate?: string;
  year?: number;
  country?: string;
  stateProvince?: string;
  locality: string;
  basisOfRecord?: string;
  datasetName: string;
  occurrenceID?: string;
  references?: string;
  coordinateUncertaintyInMeters?: number;
  imageUrl?: string;
  gbifUrl: string;
  isRealData: true;
}

export interface SpeciesResolutionResult {
  success: boolean;
  query: string;
  taxonKey?: number;
  scientificName?: string;
  canonicalName?: string;
  commonName?: string;
  rank?: string;
  family?: string;
  confidence?: number;
  matchType?: string;
  isConfident: boolean;
  errorMessage?: string;
  possibleAlternatives?: Array<{
    scientificName: string;
    canonicalName?: string;
    rank?: string;
    family?: string;
  }>;
}

/**
 * Common botanical name dictionary to help bridge colloquial terms
 * to their accepted botanical scientific names before GBIF taxonomy matching.
 */
const COMMON_TO_SCIENTIFIC_MAP: Record<string, { scientific: string; common: string; family?: string }> = {
  tulsi: { scientific: 'Ocimum tenuiflorum', common: 'Tulsi (Holy Basil)', family: 'Lamiaceae' },
  'holy basil': { scientific: 'Ocimum tenuiflorum', common: 'Holy Basil (Tulsi)', family: 'Lamiaceae' },
  neem: { scientific: 'Azadirachta indica', common: 'Neem', family: 'Meliaceae' },
  mango: { scientific: 'Mangifera indica', common: 'Mango', family: 'Anacardiaceae' },
  'mimosa pudica': { scientific: 'Mimosa pudica', common: 'Touch-Me-Not (Shameplant)', family: 'Fabaceae' },
  'touch-me-not': { scientific: 'Mimosa pudica', common: 'Touch-Me-Not (Mimosa)', family: 'Fabaceae' },
  lavender: { scientific: 'Lavandula angustifolia', common: 'English Lavender', family: 'Lamiaceae' },
  monstera: { scientific: 'Monstera deliciosa', common: 'Monstera (Swiss Cheese Plant)', family: 'Araceae' },
  'swiss cheese plant': { scientific: 'Monstera deliciosa', common: 'Monstera', family: 'Araceae' },
  birch: { scientific: 'Betula pendula', common: 'Silver Birch', family: 'Betulaceae' },
  'silver birch': { scientific: 'Betula pendula', common: 'Silver Birch', family: 'Betulaceae' },
  fern: { scientific: 'Dryopteris filix-mas', common: 'Male Fern', family: 'Dryopteridaceae' },
  banyan: { scientific: 'Ficus benghalensis', common: 'Banyan Tree', family: 'Moraceae' },
  peepal: { scientific: 'Ficus religiosa', common: 'Sacred Fig (Peepal)', family: 'Moraceae' },
  ashoka: { scientific: 'Saraca asoca', common: 'Ashoka Tree', family: 'Fabaceae' },
  hibiscus: { scientific: 'Hibiscus rosa-sinensis', common: 'China Rose (Hibiscus)', family: 'Malvaceae' },
  rose: { scientific: 'Rosa', common: 'Rose', family: 'Rosaceae' },
  sunflower: { scientific: 'Helianthus annuus', common: 'Common Sunflower', family: 'Asteraceae' },
  eucalyptus: { scientific: 'Eucalyptus', common: 'Eucalyptus', family: 'Myrtaceae' },
  aloe: { scientific: 'Aloe vera', common: 'Aloe Vera', family: 'Asphodelaceae' },
  'aloe vera': { scientific: 'Aloe vera', common: 'Aloe Vera', family: 'Asphodelaceae' },
  bamboo: { scientific: 'Bambusa', common: 'Bamboo', family: 'Poaceae' },
  lotus: { scientific: 'Nelumbo nucifera', common: 'Sacred Lotus', family: 'Nelumbonaceae' },
  banana: { scientific: 'Musa', common: 'Banana', family: 'Musaceae' },
  guava: { scientific: 'Psidium guajava', common: 'Guava', family: 'Myrtaceae' },
  jasmine: { scientific: 'Jasminum', common: 'Jasmine', family: 'Oleaceae' },
  marigold: { scientific: 'Tagetes', common: 'Marigold', family: 'Asteraceae' },
  mint: { scientific: 'Mentha', common: 'Mint', family: 'Lamiaceae' },
  basil: { scientific: 'Ocimum basilicum', common: 'Sweet Basil', family: 'Lamiaceae' },
  orchid: { scientific: 'Orchidaceae', common: 'Orchid', family: 'Orchidaceae' },
  tomato: { scientific: 'Solanum lycopersicum', common: 'Tomato', family: 'Solanaceae' },
  potato: { scientific: 'Solanum tuberosum', common: 'Potato', family: 'Solanaceae' },
  coconut: { scientific: 'Cocos nucifera', common: 'Coconut Palm', family: 'Arecaceae' },
  papaya: { scientific: 'Carica papaya', common: 'Papaya', family: 'Caricaceae' },
  ginger: { scientific: 'Zingiber officinale', common: 'Ginger', family: 'Zingiberaceae' },
  turmeric: { scientific: 'Curcuma longa', common: 'Turmeric', family: 'Zingiberaceae' },
};

// GBIF Backbone Taxonomy Dataset Key
const GBIF_BACKBONE_DATASET_KEY = 'd7dddbf4-2cf0-4f39-9b2a-bb099caae36c';
// Plantae Kingdom Key in GBIF
const PLANTAE_KINGDOM_KEY = 6;

/**
 * 1. GBIF Species Matching API (v1)
 * URL: https://api.gbif.org/v1/species/match?name=QUERY&kingdom=Plantae&verbose=true
 *
 * Resolves scientific names and common names against the GBIF taxonomy backbone.
 * Includes fallback to GBIF Backbone Species Search if direct match returns no match or higher kingdom rank.
 */
export async function matchGbifSpecies(query: string): Promise<SpeciesResolutionResult> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return {
      success: false,
      query: '',
      isConfident: false,
      errorMessage: 'Please enter a plant name to search.',
    };
  }

  // Check known common name bridge first to assist vernacular search
  const lower = cleanQuery.toLowerCase();
  const knownMapping = COMMON_TO_SCIENTIFIC_MAP[lower];
  const searchNameToUse = knownMapping ? knownMapping.scientific : cleanQuery;

  try {
    const encoded = encodeURIComponent(searchNameToUse);
    const url = `https://api.gbif.org/v1/species/match?name=${encoded}&kingdom=Plantae&verbose=true`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`GBIF Species API returned HTTP ${res.status}: ${res.statusText}`);
    }

    const data: GbifSpeciesMatch = await res.json();

    // Check if match was found and confident
    const matchType = data.matchType || 'NONE';
    const confidence = typeof data.confidence === 'number' ? data.confidence : 0;
    const taxonKey = data.acceptedUsageKey || data.usageKey || data.speciesKey;

    // Filter alternatives
    const alternatives = (data.alternatives || []).map((alt) => ({
      scientificName: alt.scientificName,
      canonicalName: alt.canonicalName,
      rank: alt.rank,
      family: alt.family,
    }));

    // If GBIF returned a valid species/genus match (not just Kingdom rank #6)
    const isHigherRankOnly = data.rank === 'KINGDOM' || taxonKey === PLANTAE_KINGDOM_KEY;

    if (matchType !== 'NONE' && taxonKey && !isHigherRankOnly && confidence >= 50) {
      const scientificName = data.scientificName || data.canonicalName || searchNameToUse;
      const canonicalName = data.canonicalName || scientificName;
      const commonName = knownMapping ? knownMapping.common : cleanQuery;

      return {
        success: true,
        query: cleanQuery,
        taxonKey,
        scientificName,
        canonicalName,
        commonName,
        rank: data.rank || 'SPECIES',
        family: data.family || knownMapping?.family,
        confidence,
        matchType,
        isConfident: true,
        possibleAlternatives: alternatives,
      };
    }

    // Step 1b: Fallback to GBIF Backbone Species Search (highertaxonKey=6 for Plantae)
    const searchUrl = `https://api.gbif.org/v1/species/search?datasetKey=${GBIF_BACKBONE_DATASET_KEY}&highertaxonKey=${PLANTAE_KINGDOM_KEY}&limit=10&q=${encodeURIComponent(cleanQuery)}`;
    const searchRes = await fetch(searchUrl, {
      headers: { Accept: 'application/json' },
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.results && Array.isArray(searchData.results) && searchData.results.length > 0) {
        // Find best accepted plant result that is not the entire Kingdom
        const validMatch =
          searchData.results.find(
            (r: any) =>
              r.key !== PLANTAE_KINGDOM_KEY &&
              r.rank !== 'KINGDOM' &&
              (r.taxonomicStatus === 'ACCEPTED' || !r.synonym)
          ) ||
          searchData.results.find(
            (r: any) => r.key !== PLANTAE_KINGDOM_KEY && r.rank !== 'KINGDOM'
          );

        if (validMatch) {
          const matchedKey = validMatch.key || validMatch.nubKey;
          return {
            success: true,
            query: cleanQuery,
            taxonKey: matchedKey,
            scientificName: validMatch.scientificName,
            canonicalName: validMatch.canonicalName || validMatch.scientificName,
            commonName: knownMapping ? knownMapping.common : undefined,
            family: validMatch.family || knownMapping?.family,
            rank: validMatch.rank || 'SPECIES',
            confidence: 85,
            matchType: 'SEARCH_MATCH',
            isConfident: true,
            possibleAlternatives: alternatives,
          };
        }
      }
    }

    return {
      success: false,
      query: cleanQuery,
      matchType,
      confidence,
      isConfident: false,
      errorMessage: `No plant species found matching "${cleanQuery}". Try searching by botanical scientific name.`,
      possibleAlternatives: alternatives,
    };
  } catch (err: unknown) {
    console.error('[GBIF API] Species match error:', err);
    return {
      success: false,
      query: cleanQuery,
      isConfident: false,
      errorMessage: 'GBIF service cannot be reached right now. Try again shortly or check your network.',
    };
  }
}

/**
 * 2. GBIF Occurrence Search API (v1)
 * URL: https://api.gbif.org/v1/occurrence/search
 *
 * Retrieves real georeferenced observations using taxonKey, hasCoordinate=true, limit=100.
 * Basis of record parameters are correctly appended as individual parameters.
 */
export async function fetchGbifOccurrencesByTaxon(
  taxonKey: number,
  limit: number = 100
): Promise<PlantOccurrenceRecord[]> {
  try {
    const url = new URL('https://api.gbif.org/v1/occurrence/search');
    url.searchParams.set('taxonKey', taxonKey.toString());
    url.searchParams.set('hasCoordinate', 'true');
    url.searchParams.set('limit', Math.min(limit, 100).toString());

    // In GBIF API, multiple basisOfRecord values must be appended as individual query parameters
    url.searchParams.append('basisOfRecord', 'HUMAN_OBSERVATION');
    url.searchParams.append('basisOfRecord', 'PRESERVED_SPECIMEN');
    url.searchParams.append('basisOfRecord', 'OBSERVATION');
    url.searchParams.append('basisOfRecord', 'MACHINE_OBSERVATION');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`GBIF Occurrence search returned HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return parseValidGbifOccurrences(data.results);
  } catch (err: unknown) {
    console.error('[GBIF API] Occurrence search error:', err);
    throw err;
  }
}

/**
 * Validates and converts raw GBIF occurrence results to clean PlantOccurrenceRecord items.
 * Strictly verifies decimalLatitude and decimalLongitude.
 */
export function parseValidGbifOccurrences(results: any[]): PlantOccurrenceRecord[] {
  const records: PlantOccurrenceRecord[] = [];

  for (const item of results) {
    // 1. Validate numerical coordinates
    const lat = item.decimalLatitude;
    const lng = item.decimalLongitude;

    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      continue;
    }

    // 2. Validate valid coordinate range
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      continue;
    }

    // 3. Extract media image if available
    let imageUrl: string | undefined = undefined;
    if (item.media && Array.isArray(item.media) && item.media.length > 0) {
      const imgItem = item.media.find(
        (m: any) => {
          const id = m.identifier || m['http://purl.org/dc/terms/identifier'];
          const type = m.type || m['http://purl.org/dc/terms/type'];
          const format = m.format || m['http://purl.org/dc/terms/format'];
          return (
            id &&
            (type === 'StillImage' ||
              format?.includes('image') ||
              /\.(jpg|jpeg|png|webp)/i.test(id))
          );
        }
      );
      if (imgItem) {
        imageUrl = imgItem.identifier || imgItem['http://purl.org/dc/terms/identifier'];
      }
    }

    // 4. Formatted date string
    let eventDateStr: string | undefined = undefined;
    if (item.eventDate) {
      try {
        const d = new Date(item.eventDate);
        if (!isNaN(d.getTime())) {
          eventDateStr = d.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
        } else {
          eventDateStr = String(item.eventDate).split('T')[0];
        }
      } catch {
        eventDateStr = String(item.eventDate).split('T')[0];
      }
    } else if (item.year) {
      eventDateStr = String(item.year);
    }

    // 5. Locality text
    const locParts = [item.locality, item.stateProvince, item.country].filter(Boolean);
    const locality =
      locParts.length > 0
        ? locParts.join(', ')
        : item.country
        ? item.country
        : 'Georeferenced field record';

    records.push({
      id: `gbif-${item.key}`,
      gbifKey: item.key,
      scientificName: item.acceptedScientificName || item.scientificName || 'Botanical observation',
      commonName: item.vernacularName,
      family: item.family || 'Plantae',
      coordinates: { lat, lng },
      eventDate: eventDateStr,
      year: item.year,
      country: item.country,
      stateProvince: item.stateProvince,
      locality,
      basisOfRecord: item.basisOfRecord?.replace(/_/g, ' ').toLowerCase(),
      datasetName: item.datasetName || item.institutionCode || 'GBIF Occurrence Dataset',
      occurrenceID: item.occurrenceID,
      references: item.references,
      coordinateUncertaintyInMeters: item.coordinateUncertaintyInMeters,
      imageUrl,
      gbifUrl: `https://www.gbif.org/occurrence/${item.key}`,
      isRealData: true,
    });
  }

  return records;
}
