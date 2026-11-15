import { createHash } from 'node:crypto';

export type PageHistory = { content_hash: string; template_hash: string; last_modified_at: string };
export type SitemapHistory = { version: 1; pages: Record<string, PageHistory> };
export const emptyHistory = (): SitemapHistory => ({ version: 1, pages: {} });
export const contentHash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export function validTimestamp(value: unknown, now = new Date()): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== value.slice(0, 10)) return;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time < 0 || time > now.getTime()) return;
  return new Date(time).toISOString();
}

export function latestTimestamp(values: unknown[], now = new Date()): string | undefined {
  return values.map(value => validTimestamp(value, now)).filter((value): value is string => Boolean(value)).sort().pop();
}

export function validateHistory(value: unknown, now = new Date()): SitemapHistory {
  const history = value as SitemapHistory;
  if (history?.version !== 1 || !history.pages || typeof history.pages !== 'object' || Array.isArray(history.pages)) throw new Error('Invalid sitemap history');
  for (const [pathname, page] of Object.entries(history.pages)) {
    if (!pathname.startsWith('/') || !page || !/^[a-f0-9]{64}$/.test(page.content_hash) || !/^[a-f0-9]{64}$/.test(page.template_hash) || !validTimestamp(page.last_modified_at, now)) {
      throw new Error('Invalid sitemap history entry');
    }
  }
  return history;
}

export async function fetchPublishedHistory(siteUrl: string, request: typeof fetch = fetch): Promise<SitemapHistory | undefined> {
  const response = await request(`${siteUrl}/seo-history.json`, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`Published sitemap history read failed: HTTP ${response.status}`);
  // Migration from the old SPA: its catch-all rewrite returns HTML for missing files.
  if (response.headers.get('content-type')?.includes('text/html')) return;
  return validateHistory(await response.json());
}

export function pageHistory(
  content_hash: string,
  template_hash: string,
  previous: PageHistory | undefined,
  sourceModifiedAt: string | undefined,
  now = new Date(),
): PageHistory {
  const sourceDate = validTimestamp(sourceModifiedAt, now);
  if (previous?.content_hash === content_hash) return previous;
  // A template change or an undated edit was observed in this build. A normal
  // record update can retain its actual source timestamp when it moves forward.
  const last_modified_at = previous
    ? previous.template_hash === template_hash && sourceDate && sourceDate > previous.last_modified_at ? sourceDate : now.toISOString()
    : sourceDate || now.toISOString();
  return { content_hash, template_hash, last_modified_at };
}
