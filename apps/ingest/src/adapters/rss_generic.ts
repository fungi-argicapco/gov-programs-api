import { load, type Cheerio, type CheerioAPI } from 'cheerio';
import { parseISO } from 'date-fns';
import { Program, type Adapter, type AdapterContext, type AdapterResult, type ProgramT } from '@common/types';

export const generateSlug = (label: string): string => {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
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

  return undefined;
};

const hashId = (input: string): string => {
  return createHash('sha256').update(input).digest('hex');
};

export const deriveProgramId = (item: Pick<RssItemT, 'guid' | 'link' | 'title'>): string => {
  const guid = normalizeGuid(item.guid);
  if (guid) {
    return hashId(guid);
  }

  const link = item.link?.trim();
  if (link) {
    return hashId(link);
  }

  const title = item.title.trim();
  const fallbackSeed = `${title}|${item.link ?? ''}`;
  return hashId(fallbackSeed);
};

export const adaptRssItemToProgram = (raw: RssItemT): ProgramT => {
  const item = RssItem.parse(raw);
  const { title, summary, link, isoDate } = item;
  const categories = item.categories ?? [];

  const programId = deriveProgramId(item);

  const program: ProgramT = Program.parse({
    id: programId,
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
