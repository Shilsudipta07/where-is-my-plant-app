import { CommunityObservation } from '../types/plant';

const COMMUNITY_OBS_STORAGE_KEY = 'where_is_my_plant_community_obs_v1';

export function getStoredCommunityObservations(): CommunityObservation[] {
  try {
    const raw = localStorage.getItem(COMMUNITY_OBS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[observationStorage] Notice reading community observations:', e);
    return [];
  }
}

export function saveCommunityObservation(obs: CommunityObservation): void {
  try {
    const current = getStoredCommunityObservations();
    const updated = [obs, ...current.filter((item) => item.id !== obs.id)];
    localStorage.setItem(COMMUNITY_OBS_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('community-observations-updated'));
  } catch (e) {
    console.warn('[observationStorage] Notice saving community observation:', e);
  }
}

export function deleteCommunityObservation(id: string): void {
  try {
    const current = getStoredCommunityObservations();
    const updated = current.filter((item) => item.id !== id);
    localStorage.setItem(COMMUNITY_OBS_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('community-observations-updated'));
  } catch (e) {
    console.warn('[observationStorage] Notice deleting community observation:', e);
  }
}

export function initCommunityObservationsSync(
  callback: (records: CommunityObservation[]) => void
): () => void {
  const handler = () => {
    callback(getStoredCommunityObservations());
  };
  window.addEventListener('storage', handler);
  window.addEventListener('community-observations-updated', handler);
  // initial call
  callback(getStoredCommunityObservations());

  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener('community-observations-updated', handler);
  };
}
