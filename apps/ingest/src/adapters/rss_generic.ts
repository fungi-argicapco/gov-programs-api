import { load, type Cheerio, type CheerioAPI } from 'cheerio';
import { parseISO } from 'date-fns';
import { Program, type Adapter, type AdapterContext, type AdapterResult, type ProgramT } from '@common/types';

export const generateSlug = (label: string): string => {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : '-';
};

const parseItem = (item: Cheerio<any>, $: CheerioAPI): ProgramT | null => {
  const title = item.find('title').first().text().trim();
  if (!title) return null;
  const link = item.find('link').first().text().trim();
  const summary = item.find('description').first().text().trim();
  const pubDate = item.find('pubDate').first().text().trim();
  let startDate: string | undefined;
  if (pubDate) {
    const parsed = parseISO(pubDate);
    if (!Number.isNaN(parsed.getTime())) {
      startDate = parsed.toISOString();
    }
  }
  const categories = item
    .find('category')
    .map((_, node) => $(node).text().trim())
    .get()
    .filter((value): value is string => value.length > 0);

  const program: ProgramT = Program.parse({
    id: crypto.randomUUID(),
    title,
    summary: summary || undefined,
    websiteUrl: link || undefined,
    startDate,
    tags: categories.map((label) => ({
      id: crypto.randomUUID(),
      slug: generateSlug(label),
      label
    }))
  });

  return program;
};

const execute = async (sourceUrl: string, context: AdapterContext): Promise<AdapterResult> => {
  const response = await context.fetch(sourceUrl);
  const xml = await response.text();
  const $ = load(xml, { xml: true });
  const items = $('item').toArray();
  const programs: ProgramT[] = [];
  for (const node of items) {
    const parsed = parseItem($(node), $);
    if (parsed) {
      programs.push(parsed);
    }
  }
  return { programs, raw: xml };
};

export const rssGenericAdapter: Adapter = {
  name: 'rss_generic',
  supports: (url: string) => url.includes('rss') || url.endsWith('.xml'),
  execute
};

export default rssGenericAdapter;
