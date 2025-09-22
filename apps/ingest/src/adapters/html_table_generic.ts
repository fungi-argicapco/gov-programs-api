import { load } from 'cheerio';
import { parseISO } from 'date-fns';
import { Program, type Adapter, type AdapterContext, type AdapterResult, type ProgramT } from '@common/types';

const normalizeDate = (value?: string) => {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const execute = async (sourceUrl: string, context: AdapterContext): Promise<AdapterResult> => {
  const response = await context.fetch(sourceUrl);
  const html = await response.text();
  const $ = load(html);
  const headerCells = $('table thead th').toArray().map((node) => $(node).text().trim().toLowerCase());
  const programs: ProgramT[] = [];

  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length === 0) return;
    const values: Record<string, string> = {};
    cells.each((index, cell) => {
      const key = headerCells[index] ?? `col_${index}`;
      values[key] = $(cell).text().trim();
      const link = $(cell).find('a[href]').attr('href');
      if (link) {
        values[`${key}_url`] = link;
      }
    });

    const tags = (values['tags'] ?? values['tag'] ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);

    const statusRaw = (values['status'] ?? '').toLowerCase();
    const validStatuses = ['open', 'scheduled', 'closed'] as const;
    const normalizedStatus: ProgramT['status'] = validStatuses.includes(statusRaw as typeof validStatuses[number])
      ? (statusRaw as typeof validStatuses[number])
      : 'unknown';

    const program: ProgramT = Program.parse({
      id: crypto.randomUUID(),
      title: values['title'] ?? values['program'] ?? 'Untitled program',
      summary: values['summary'] || undefined,
      websiteUrl: values['link_url'] || values['title_url'] || undefined,
      startDate: normalizeDate(values['start date'] ?? values['start_date']),
      endDate: normalizeDate(values['end date'] ?? values['end_date']),
      status: normalizedStatus,
      tags: tags.map((label) => ({ id: crypto.randomUUID(), slug: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label }))
    });

    programs.push(program);
  });

  return { programs, raw: html };
};

export const htmlTableGenericAdapter: Adapter = {
  name: 'html_table_generic',
  supports: (url: string) => url.endsWith('.html') || url.startsWith('http'),
  execute
};

export default htmlTableGenericAdapter;
