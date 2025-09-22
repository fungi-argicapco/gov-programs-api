import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { rssGenericAdapter, generateSlug } from './rss_generic';
import { htmlTableGenericAdapter } from './html_table_generic';
import { jsonApiGenericAdapter } from './json_api_generic';

const mockUuid = (): (() => `${string}-${string}-${string}-${string}-${string}`) => {
  let counter = 0;
  return () =>
    `00000000-0000-4000-8000-${(counter++).toString().padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`;
};

const createFetch = (body: string, contentType = 'application/xml') =>
  vi.fn(async () =>
    new Response(body, {
      headers: { 'content-type': contentType }
    })
  );

describe('rssGenericAdapter', () => {
  beforeEach(() => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(mockUuid());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('parses RSS items into programs', async () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Program A</title><link>https://example.com/a</link><description>A summary</description><category>Energy</category><pubDate>2024-01-01</pubDate></item></channel></rss>`;
    const fetch = createFetch(xml);
    const result = await rssGenericAdapter.execute('https://example.com/rss.xml', { fetch });
    expect(result.programs).toHaveLength(1);
    expect(result.programs[0].title).toBe('Program A');
    expect(result.programs[0].tags[0].label).toBe('Energy');
  });
});

describe('generateSlug', () => {
  test('creates lowercase hyphenated slugs', () => {
    expect(generateSlug('Energy Efficiency')).toBe('energy-efficiency');
  });

  test('trims repeated separators from ends', () => {
    expect(generateSlug('--Already--Normalized--')).toBe('already-normalized');
  });
});

describe('htmlTableGenericAdapter', () => {
  beforeEach(() => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(mockUuid());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('parses HTML table rows into programs', async () => {
    const html = `<table><thead><tr><th>Title</th><th>Summary</th><th>Status</th><th>Tags</th></tr></thead><tbody><tr><td><a href="https://example.com">Program B</a></td><td>Summary B</td><td>Open</td><td>Manufacturing, Export</td></tr></tbody></table>`;
    const fetch = createFetch(html, 'text/html');
    const result = await htmlTableGenericAdapter.execute('https://example.com/table.html', { fetch });
    expect(result.programs).toHaveLength(1);
    expect(result.programs[0].title).toBe('Program B');
    expect(result.programs[0].status).toBe('open');
    expect(result.programs[0].tags).toHaveLength(2);
  });
});

describe('jsonApiGenericAdapter', () => {
  beforeEach(() => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(mockUuid());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('parses JSON array into programs', async () => {
    const payload = [{ id: 'program-c', title: 'Program C', tags: ['Tech'], industries: ['54'] }];
    const fetch = vi.fn(async () => new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } }));
    const result = await jsonApiGenericAdapter.execute('https://example.com/api.json', { fetch });
    expect(result.programs).toHaveLength(1);
    expect(result.programs[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.programs[0].industries).toEqual(['54']);
  });
});
