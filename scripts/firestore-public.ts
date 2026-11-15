import type { Plant } from '../src/types/plant';
import { validTimestamp } from './sitemap-history';

type FirestoreValue = { stringValue?: string; timestampValue?: string; doubleValue?: number; integerValue?: string; mapValue?: { fields?: Record<string, FirestoreValue> } };
type FirestoreDocument = { name: string; fields?: Record<string, FirestoreValue> };

export async function fetchPublicPlants(projectId: string, request: typeof fetch = fetch): Promise<Plant[]> {
  const plants: Plant[] = [];
  let pageToken = '';
  const seenTokens = new Set<string>();
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/plants`);
    url.searchParams.set('pageSize', '500');
    // Fetch only fields used by public HTML; exclude account and ownership data.
    for (const field of ['commonName', 'scientificName', 'description', 'family', 'habitat', 'category', 'bloomSeason', 'sunExposure', 'waterNeeds', 'difficulty', 'studentTip', 'coordinates', 'createdAt', 'updatedAt']) {
      url.searchParams.append('mask.fieldPaths', field);
    }
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await request(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Public Firestore read failed: HTTP ${response.status}`);
    const body = await response.json() as { documents?: FirestoreDocument[]; nextPageToken?: string };
    if (body.documents !== undefined && !Array.isArray(body.documents)) throw new Error('Invalid Firestore list response');
    for (const document of body.documents || []) {
      const fields = document.fields || {};
      const text = (field: string) => fields[field]?.stringValue || '';
      const coordinateFields = fields.coordinates?.mapValue?.fields;
      const number = (field: string) => Number(coordinateFields?.[field]?.doubleValue ?? coordinateFields?.[field]?.integerValue);
      const lat = number('lat');
      const lng = number('lng');
      if (!text('commonName') && !text('scientificName')) continue;
      const id = document.name.split('/').pop();
      if (!id || id === '.' || id === '..') throw new Error('Invalid public plant ID');
      plants.push({
        id, commonName: text('commonName'), scientificName: text('scientificName'),
        description: text('description'), family: text('family'), habitat: text('habitat'),
        category: text('category') || 'Wildflower', bloomSeason: text('bloomSeason'),
        sunExposure: text('sunExposure') || 'Full Sun', waterNeeds: text('waterNeeds') || 'Moderate',
        difficulty: text('difficulty') || 'Beginner', studentTip: text('studentTip'),
        imageUrl: '', locationName: '', sightedCount: 1,
        coordinates: Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : undefined,
        identificationKeys: { leafShape: '', leafArrangement: '', flowerColor: '', growthHabit: '' },
        isUserAdded: true,
        createdAt: validTimestamp(fields.createdAt?.timestampValue || fields.createdAt?.stringValue),
        updatedAt: validTimestamp(fields.updatedAt?.timestampValue || fields.updatedAt?.stringValue),
      } as Plant);
    }
    pageToken = body.nextPageToken || '';
    if (pageToken && seenTokens.has(pageToken)) throw new Error('Repeated Firestore pagination token');
    seenTokens.add(pageToken);
  } while (pageToken);
  return plants;
}
