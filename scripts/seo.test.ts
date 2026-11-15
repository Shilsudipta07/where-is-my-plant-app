import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { fetchPublicPlants } from './firestore-public';
import { staticHosting } from './static-hosting';
import { INITIAL_PLANTS } from '../src/data/samplePlants';
import { routePath, SITE_URL } from '../src/utils/routes';
import { contentHash, emptyHistory, fetchPublishedHistory, latestTimestamp, pageHistory, validTimestamp, validateHistory } from './sitemap-history';
import { getPageSeo } from '../src/utils/seo';

test('lastmod stays stable on unchanged builds and advances for content changes', async () => {
  const firstBuild = new Date('2026-01-02T12:00:00Z');
  const nextBuild = new Date('2026-01-10T12:00:00Z');
  const hash = contentHash('page content');
  const template = contentHash('template');
  const first = pageHistory(hash, template, undefined, undefined, firstBuild);
  assert.equal(first.last_modified_at, firstBuild.toISOString());
  assert.deepEqual(pageHistory(hash, template, first, undefined, nextBuild), first);
  const updated = pageHistory(contentHash('changed content'), template, first, '2026-01-09T09:00:00Z', nextBuild);
  assert.equal(updated.last_modified_at, '2026-01-09T09:00:00.000Z');
  const layoutChanged = pageHistory(contentHash('new layout'), contentHash('new template'), first, '2026-01-09T09:00:00Z', nextBuild);
  assert.equal(layoutChanged.last_modified_at, nextBuild.toISOString());
  const deletedItem = pageHistory(contentHash('catalog without deleted plant'), template, first, '2025-12-01T00:00:00Z', nextBuild);
  assert.equal(deletedItem.last_modified_at, nextBuild.toISOString());
  assert.equal(pageHistory(hash, template, undefined, '2099-01-01T00:00:00Z', firstBuild).last_modified_at, firstBuild.toISOString());
  assert.equal(validTimestamp('2026-01-01T10:30:00.123456789+05:30', nextBuild), '2026-01-01T05:00:00.123Z');
  for (const invalid of ['2026-02-30T12:00:00Z', 'bad date', '2026-01-01', '2026-01-01T25:00:00Z', '2099-01-01T00:00:00Z']) assert.equal(validTimestamp(invalid, nextBuild), undefined);
  assert.equal(latestTimestamp(['bad', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'], nextBuild), '2026-01-02T00:00:00.000Z');
  assert.deepEqual(validateHistory({ version: 1, pages: { '/': first } }, nextBuild).pages['/'], first);
  assert.throws(() => validateHistory({ version: 1, pages: { '/': { ...first, last_modified_at: '2099-01-01T00:00:00Z' } } }, nextBuild), /Invalid/);
  assert.deepEqual(await fetchPublishedHistory(SITE_URL, (async () => Response.json(emptyHistory())) as typeof fetch), emptyHistory());
  assert.equal(await fetchPublishedHistory(SITE_URL, (async () => new Response('', { status: 404 })) as typeof fetch), undefined);
  assert.equal(await fetchPublishedHistory(SITE_URL, (async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } })) as typeof fetch), undefined);
  await assert.rejects(fetchPublishedHistory(SITE_URL, (async () => new Response('', { status: 500 })) as typeof fetch), /HTTP 500/);
  await assert.rejects(fetchPublishedHistory(SITE_URL, (async () => Response.json({ version: 1, pages: [] })) as typeof fetch), /Invalid/);
});

test('Firestore pagination includes public records, excludes private fields and validates errors', async () => {
  const urls: URL[] = [];
  const pages = [
    { documents: [{ name: 'projects/test/databases/(default)/documents/plants/a & b', fields: { commonName: { stringValue: 'A & B' }, ownerUid: { stringValue: 'private' }, createdAt: { timestampValue: '2026-01-01T00:00:00Z' }, updatedAt: { timestampValue: '2026-01-02T00:00:00.123456Z' }, coordinates: { mapValue: { fields: { lat: { doubleValue: 22.5 }, lng: { integerValue: '88' } } } } } }], nextPageToken: 'next' },
    { documents: [{ name: 'projects/test/databases/(default)/documents/plants/empty', fields: {} }] },
  ];
  const records = await fetchPublicPlants('test', (async url => {
    urls.push(new URL(String(url)));
    return Response.json(pages.shift());
  }) as typeof fetch);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'a & b');
  assert.deepEqual(records[0].coordinates, { lat: 22.5, lng: 88 });
  assert.equal(records[0].createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(records[0].updatedAt, '2026-01-02T00:00:00.123Z');
  assert.ok(!('ownerUid' in records[0]));
  assert.equal(urls[1].searchParams.get('pageToken'), 'next');
  assert.ok(!urls[0].searchParams.getAll('mask.fieldPaths').includes('ownerUid'));
  assert.deepEqual(await fetchPublicPlants('test', (async () => Response.json({})) as typeof fetch), []);
  await assert.rejects(fetchPublicPlants('test', (async () => new Response('', { status: 403 })) as typeof fetch), /HTTP 403/);
  await assert.rejects(fetchPublicPlants('test', (async () => Response.json({ nextPageToken: 'same' })) as typeof fetch), /Repeated/);
});

test('built site serves prerendered public pages, metadata, assets, private pages and real 404s', async () => {
  const app = express();
  app.use(staticHosting());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const xml = await readFile('dist/sitemap.xml', 'utf8');
    assert.equal(xml, await readFile('dist/plant-sitemap.xml', 'utf8'));
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1].replace(/&amp;/g, '&'));
    const history = validateHistory(JSON.parse(await readFile('dist/seo-history.json', 'utf8')));
    const lastmods = [...xml.matchAll(/<lastmod>(.*?)<\/lastmod>/g)].map(match => match[1]);
    assert.equal(lastmods.length, urls.length);
    assert.ok(urls.length >= 20);
    assert.equal(new Set(urls).size, urls.length);
    const staticTitles = new Set<string>();
    for (const [index, url] of urls.entries()) {
      assert.equal(new URL(url).origin, SITE_URL);
      const pathname = new URL(url).pathname;
      assert.equal(lastmods[index], validTimestamp(lastmods[index]));
      assert.equal(lastmods[index], history.pages[pathname].last_modified_at);
      const response = await fetch(base + pathname);
      assert.equal(response.status, 200, pathname);
      const html = await response.text();
      assert.equal([...html.matchAll(/rel="canonical"/g)].length, 1, pathname);
      assert.equal(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], url.replace(/&/g, '&amp;'), pathname);
      assert.ok(html.includes('<h1'), pathname);
      assert.ok(html.includes('<main>'), pathname);
      assert.ok(html.includes('content="index, follow"'), pathname);
      const title = html.match(/<title>(.*?)<\/title>/)![1];
      assert.ok(title.endsWith(' | WHERE IS MY PLANT'));
      const meta = (attribute: string, name: string) => html.match(new RegExp(`<meta ${attribute}="${name}" content="([^"]*)"`))?.[1];
      assert.equal(meta('property', 'og:title'), title);
      assert.equal(meta('name', 'twitter:title'), title);
      assert.equal(meta('property', 'og:url'), url.replace(/&/g, '&amp;'));
      assert.ok(meta('name', 'description'));
      assert.equal(meta('name', 'description'), meta('property', 'og:description'));
      assert.equal(meta('name', 'description'), meta('name', 'twitter:description'));
      const schema = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
      assert.ok(schema);
      assert.ok(JSON.parse(schema)['@graph'].length > 0);
      if (!pathname.startsWith('/plants/')) staticTitles.add(title);
      assert.ok(!pathname.includes('account') && !pathname.includes('my-observations'));
      for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)) {
        assert.ok((await stat(path.join('dist', decodeURIComponent(match[1])))).size > 0, match[1]);
      }
    }
    assert.equal(staticTitles.size, 8);
    for (const plant of INITIAL_PLANTS) {
      assert.ok(urls.includes(SITE_URL + routePath('plant-details', plant.id)));
      const html = await (await fetch(base + routePath('plant-details', plant.id))).text();
      assert.ok(html.includes(plant.commonName));
      assert.ok(html.includes(plant.scientificName));
      const seed = JSON.parse(html.match(/id="page-plant" type="application\/json">([\s\S]*?)<\/script>/)![1]);
      assert.equal(seed.id, plant.id);
    }
    // Two observations may legitimately describe the same species; their
    // canonical URLs must remain distinct even when their page titles match.
    const plant = INITIAL_PLANTS[0];
    assert.notEqual(getPageSeo('plant-details', { ...plant, id: 'observation-1' }).canonical, getPageSeo('plant-details', { ...plant, id: 'observation-2' }).canonical);
    assert.ok(!getPageSeo('plant-details', { ...plant, scientificName: '' }).title.includes('()'));
    for (const pathname of ['/account', '/my-observations']) {
      const response = await fetch(base + pathname);
      assert.equal(response.status, 200);
      assert.ok((await response.text()).includes('content="noindex, follow"'));
    }
    for (const pathname of ['/missing', '/plants/does-not-exist', '/assets/missing.js']) {
      const response = await fetch(base + pathname);
      assert.equal(response.status, 404, pathname);
      const html = await response.text();
      assert.ok(html.includes('noindex, follow'));
      assert.ok(!html.includes('<script type="module"'));
    }
    const redirect = await fetch(base + '/about/?ref=test', { redirect: 'manual' });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('location'), '/about?ref=test');
    assert.equal((await fetch(base + '/plants/tulsi', { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(base + '/missing', { method: 'HEAD' })).status, 404);
    const config = JSON.parse(await readFile('firebase.json', 'utf8'));
    assert.equal(config.hosting.cleanUrls, true);
    assert.equal(config.hosting.rewrites, undefined);
    const historyResponse = await fetch(base + '/seo-history.json');
    assert.equal(historyResponse.headers.get('x-robots-tag'), 'noindex');
    assert.equal(historyResponse.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    console.log(`Verified ${urls.length} public routes without JavaScript, private routes, asset paths, redirects and 404s.`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
