import type { ActiveTab } from '../types/plant';

export const SITE_URL = 'https://where-is-my-plant-bc671.web.app';

export const TAB_PATHS: Record<Exclude<ActiveTab, 'plant-details' | 'search-results'>, string> = {
  home: '/',
  explore: '/explore',
  map: '/map',
  search: '/search',
  identify: '/identify',
  add: '/add',
  carbon: '/carbon',
  about: '/about',
  account: '/account',
  'my-observations': '/my-observations',
};

export function readRoute(pathname: string): { tab: ActiveTab; plantId?: string; isValid: boolean } {
  const path = pathname.replace(/\/+$/, '') || '/';
  const match = path.match(/^\/plants\/([^/]+)$/);
  if (match) {
    try {
      return { tab: 'plant-details', plantId: decodeURIComponent(match[1]), isValid: true };
    } catch {
      return { tab: 'home', isValid: false };
    }
  }
  const tab = Object.entries(TAB_PATHS).find(([, value]) => value === path)?.[0];
  return { tab: (tab as ActiveTab | undefined) || 'home', isValid: Boolean(tab) };
}

export function routePath(tab: ActiveTab, plantId?: string): string {
  if (tab === 'plant-details') return plantId ? `/plants/${encodeURIComponent(plantId)}` : '/';
  return TAB_PATHS[tab === 'search-results' ? 'search' : tab];
}
