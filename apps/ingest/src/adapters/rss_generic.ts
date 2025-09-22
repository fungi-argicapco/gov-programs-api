import { createHash } from 'node:crypto';
import { z } from 'zod';

const Program = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  websiteUrl: z.string().optional(),
  startDate: z.string().optional(),
  tags: z
    .object({
      id: z.string(),
      slug: z.string(),
      label: z.string()
    })
    .array()
    .default([])
});

export type ProgramT = z.infer<typeof Program>;

const RssItem = z.object({
  guid: z
    .union([
      z.string(),
      z.object({ value: z.string().optional() }).partial()
    ])
    .optional(),
  link: z.string().optional(),
  title: z.string(),
  summary: z.string().optional(),
  categories: z.array(z.string()).optional(),
  isoDate: z.string().optional()
});

export type RssItemT = z.infer<typeof RssItem>;

const normalizeGuid = (guid: RssItemT['guid']): string | undefined => {
  if (!guid) {
    return undefined;
  }

  if (typeof guid === 'string') {
    return guid.trim() || undefined;
  }

  if (typeof guid.value === 'string') {
    const trimmed = guid.value.trim();
    if (trimmed.length > 0) {
      return trimmed;
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
    startDate: isoDate || undefined,
    tags: categories.map((label) => {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slugOrHash = slug || hashId(label);
      return {
        id: `${programId}:${slugOrHash}`,
        slug: slugOrHash,
        label
      };
    })
  });

  return program;
};
