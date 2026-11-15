import type { ActiveTab, Plant } from '../types/plant';
import { routePath, SITE_URL } from './routes';

const PAGE_METADATA = {
  home: ['Discover, Identify & Explore Plants', 'Discover plant species, explore botanical profiles and maps, and learn how to identify plants with WHERE IS MY PLANT.'],
  explore: ['Plant Catalog & Botanical Profiles', 'Browse plant species, scientific names, identification keys, growing conditions, and botanical study notes.'],
  map: ['Explore the Plant Map', 'Explore mapped plant locations and biodiversity observations, and find plants around your location.'],
  search: ['Search Plants by Name', 'Search plants by common or scientific name to discover species information and biodiversity observations.'],
  identify: ['Identify a Plant', 'Identify plants using botanical characteristics and explore matching species profiles and identification guides.'],
  add: ['Submit a Plant Observation', 'Contribute a plant observation with photos and location information to the community botanical collection.'],
  carbon: ['Tree Carbon Observatory', 'Explore estimates of tree carbon storage and carbon dioxide sequestration using plant measurements.'],
  about: ['About the Project', 'Learn about WHERE IS MY PLANT and its mission to support plant discovery, botanical learning, and citizen science.'],
  account: ['Your Naturalist Account', 'Manage your naturalist account and profile.'],
  'my-observations': ['Your Plant Observations', 'View and manage your submitted plant observations.'],
} satisfies Record<Exclude<ActiveTab, 'plant-details' | 'search-results'>, [string, string]>;

export function getPageSeo(tab: ActiveTab, plant?: Plant | null, pathname = '/') {
  const pageTab = tab === 'search-results' ? 'search' : tab;
  const [heading, description] = pageTab === 'plant-details'
    ? plant
      ? [[plant.commonName?.trim() || plant.scientificName?.trim() || 'Plant', plant.commonName?.trim() && plant.scientificName?.trim() ? `(${plant.scientificName.trim()})` : ''].filter(Boolean).join(' '), plant.description || `Explore identification keys and botanical information for ${plant.commonName || plant.scientificName || 'this plant'}.`]
      : ['Plant Record Unavailable', 'This plant record is unavailable or still loading.']
    : PAGE_METADATA[pageTab];
  const path = pageTab === 'plant-details'
    ? plant ? routePath(pageTab, plant.id) : pathname.replace(/\/+$/, '') || '/'
    : routePath(pageTab);
  return {
    title: `${heading} | WHERE IS MY PLANT`,
    description: description.replace(/\s+/g, ' ').trim(),
    canonical: SITE_URL + path,
    robots: pageTab === 'account' || pageTab === 'my-observations' || (pageTab === 'plant-details' && !plant)
      ? 'noindex, follow' : 'index, follow',
  };
}

export function applyPageSeo(seo: ReturnType<typeof getPageSeo>) {
  document.title = seo.title;
  const setMeta = (attribute: 'name' | 'property', key: string, value: string) => {
    const element = document.querySelector(`meta[${attribute}="${key}"]`) || document.head.appendChild(document.createElement('meta'));
    element.setAttribute(attribute, key);
    element.setAttribute('content', value);
  };
  const canonical = document.querySelector('link[rel="canonical"]') || document.head.appendChild(document.createElement('link'));
  canonical.setAttribute('rel', 'canonical');
  canonical.setAttribute('href', seo.canonical);
  setMeta('name', 'description', seo.description);
  setMeta('name', 'robots', seo.robots);
  setMeta('property', 'og:url', seo.canonical);
  setMeta('property', 'og:title', seo.title);
  setMeta('property', 'og:description', seo.description);
  setMeta('name', 'twitter:title', seo.title);
  setMeta('name', 'twitter:description', seo.description);
}
