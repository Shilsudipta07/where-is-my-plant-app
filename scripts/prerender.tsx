import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { INITIAL_PLANTS } from '../src/data/samplePlants';
import { TAB_PATHS, SITE_URL, routePath } from '../src/utils/routes';
import { getPageSeo } from '../src/utils/seo';
import type { Plant, ActiveTab } from '../src/types/plant';
import { fetchPublicPlants } from './firestore-public';
import { contentHash, emptyHistory, fetchPublishedHistory, latestTimestamp, pageHistory, validateHistory } from './sitemap-history';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const template = await readFile('dist/index.html', 'utf8');
const config = JSON.parse(await readFile('firebase-applet-config.json', 'utf8'));
const livePlants = process.env.SEO_SKIP_FIRESTORE === '1' ? [] : await fetchPublicPlants(process.env.VITE_FIREBASE_PROJECT_ID || config.projectId);
if (process.env.SEO_SKIP_FIRESTORE === '1') console.warn('Offline SEO build: Firestore records omitted. Do not use this option for deployment.');
const plants = [...new Map([...INITIAL_PLANTS, ...livePlants].map(plant => [plant.id, plant])).values()];
const publicTabs = Object.keys(TAB_PATHS).filter(tab => !['account', 'my-observations'].includes(tab)) as ActiveTab[];
const now = new Date();
let localHistory = emptyHistory();
try { localHistory = validateHistory(JSON.parse(await readFile('.cache/seo-history.json', 'utf8')), now); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const publishedHistory = process.env.SEO_SKIP_FIRESTORE === '1' ? undefined : await fetchPublishedHistory(SITE_URL);
const history = emptyHistory();
// Asset URLs already fingerprint JavaScript and CSS. Include the unversioned
// botanical images too, so replacing a photo counts as a content change.
const imageHashes = await Promise.all((await readdir('dist/assets/plants')).sort().map(async file => contentHash(await readFile(path.join('dist/assets/plants', file)))));
const templateHash = contentHash(template + imageHashes.join(''));

function StaticContent({ tab, plant }: { tab: ActiveTab; plant?: Plant }) {
  const seo = getPageSeo(tab, plant);
  return <div className="max-w-7xl mx-auto p-6 text-stone-900">
    <header><a href="/">WHERE IS MY PLANT</a><nav aria-label="Public pages" className="flex flex-wrap gap-4 py-4">
      {publicTabs.map(page => <a key={page} href={routePath(page)}>{getPageSeo(page).title.split(' | ')[0]}</a>)}
    </nav></header>
    <main><h1 className="text-3xl font-bold py-4">{plant?.commonName || seo.title.split(' | ')[0]}</h1>
      <p>{seo.description}</p>
      {plant && <article>
        <h2 className="text-xl py-4">{plant.scientificName}</h2>
        {plant.imageUrl && <img src={plant.imageUrl} alt={plant.commonName} width="600" height="450" />}
        <dl>{(['family', 'habitat', 'bloomSeason', 'sunExposure', 'waterNeeds', 'difficulty'] as const).map(key => <React.Fragment key={key}><dt className="font-bold mt-3">{key.replace(/([A-Z])/g, ' $1')}</dt><dd>{plant[key]}</dd></React.Fragment>)}</dl>
        <p className="py-4">{plant.studentTip}</p><a href="/explore">Browse all plants</a>
      </article>}
      {['home', 'explore', 'identify', 'search', 'carbon', 'map'].includes(tab) && <section><h2 className="text-xl py-4">Plant profiles</h2>
        <ul>{plants.map(item => <li key={item.id} className="py-2"><a href={routePath('plant-details', item.id)}>{item.commonName} — {item.scientificName}</a><p>{item.description}</p></li>)}</ul>
      </section>}
      {tab === 'add' && <p>Enable JavaScript to sign in, add photos and submit a plant observation with its location.</p>}
      {tab === 'about' && <p>Explore botanical classification, identification guides and real biodiversity observations. The built-in collection includes demonstration data; community observations contribute additional plant records.</p>}
    </main><footer className="py-6"><a href="/sitemap.xml">Sitemap</a></footer>
  </div>;
}

async function writePage(tab: ActiveTab, plant?: Plant) {
  const seo = getPageSeo(tab, plant);
  let html = template.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escape(seo.title)}</title>`);
  for (const [attribute, name, content] of [
    ['name', 'description', seo.description], ['property', 'og:title', seo.title],
    ['property', 'og:description', seo.description], ['property', 'og:url', seo.canonical],
    ['name', 'twitter:title', seo.title], ['name', 'twitter:description', seo.description],
  ]) html = html.replace(new RegExp(`<meta ${attribute}="${name}"[^>]*>`), () => `<meta ${attribute}="${name}" content="${escape(content)}" />`);
  html = html.replace('</head>', () => `<link rel="canonical" href="${escape(seo.canonical)}" /><meta name="robots" content="${seo.robots}" /></head>`);
  const seed = plant ? `<script id="page-plant" type="application/json">${JSON.stringify(plant).replace(/</g, '\\u003c')}</script>` : '';
  html = html.replace('<div id="root"></div>', () => `<div id="root">${renderToStaticMarkup(<StaticContent tab={tab} plant={plant} />)}</div>${seed}`);
  const pathname = routePath(tab, plant?.id);
  const filename = pathname === '/' ? 'index.html' : `${decodeURIComponent(pathname.slice(1))}.html`;
  const output = path.resolve('dist', filename);
  if (!output.startsWith(path.resolve('dist') + path.sep)) throw new Error('Invalid output path');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, html);
  if (publicTabs.includes(tab) || plant) {
    const hash = contentHash(html + imageHashes.join(''));
    const published = publishedHistory?.pages[pathname];
    const local = localHistory.pages[pathname];
    const previous = published || local;
    const sourceModifiedAt = plant
      ? latestTimestamp([plant.updatedAt, plant.createdAt], now)
      : ['home', 'explore', 'identify', 'search', 'carbon', 'map'].includes(tab)
        ? latestTimestamp(plants.flatMap(item => [item.updatedAt, item.createdAt]), now) : undefined;
    history.pages[pathname] = pageHistory(hash, templateHash, previous, sourceModifiedAt, now);
    // Static pages are first published by this new renderer. Record that
    // creation time, rather than inheriting an older record's modification date.
    if (!previous && !plant) history.pages[pathname].last_modified_at = now.toISOString();
  }
  return { url: seo.canonical, lastmod: history.pages[pathname]?.last_modified_at };
}

const urls: { url: string; lastmod?: string }[] = [];
for (const tab of Object.keys(TAB_PATHS) as ActiveTab[]) {
  const url = await writePage(tab);
  if (publicTabs.includes(tab)) urls.push(url);
}
for (const plant of plants) urls.push(await writePage('plant-details', plant));
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({ url, lastmod }) => `  <url><loc>${escape(url)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
if (urls.length > 50000 || Buffer.byteLength(xml) > 50 * 1024 * 1024) throw new Error('Sitemap exceeds protocol limits; split it before deploying.');
await writeFile('dist/sitemap.xml', xml);
await writeFile('dist/plant-sitemap.xml', xml);
const notFound = template.replace(/<title>[\s\S]*?<\/title>/, '<title>Page Not Found | WHERE IS MY PLANT</title>')
  .replace('</head>', '<meta name="robots" content="noindex, follow" /></head>')
  .replace(/<script type="module"[^>]*><\/script>/g, '')
  .replace('<div id="root"></div>', '<div id="root"><main class="max-w-7xl mx-auto p-12"><h1>Page not found</h1><p>This page or plant record does not exist.</p><a href="/">Back to Home</a></main></div>');
await writeFile('dist/404.html', notFound);
await writeFile('dist/seo-history.json', JSON.stringify(history, null, 2) + '\n');
await mkdir('.cache', { recursive: true });
await writeFile('.cache/seo-history.json', JSON.stringify(history, null, 2) + '\n');
console.log(`Prerendered ${urls.length} public URLs (${livePlants.length} Firestore plants), private account pages and 404.html.`);
