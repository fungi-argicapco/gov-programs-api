import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

import type { NormalizedProgram } from './normalize';
import { enrichNaics } from './enrich';

export type EnrichmentBackfillEnv = {
  DB: D1Database;
  LOOKUPS_KV?: KVNamespace;
};

type ProgramRow = {
  id: number;
  uid: string;
  country_code: string;
  authority_level: string;
  jurisdiction_code: string;
  title: string;
  summary: string | null;
  benefit_type: string | null;
  status: string;
  industry_codes: string | null;
  start_date: string | null;
  end_date: string | null;
  url: string | null;
  source_id: number | null;
};

type BenefitRow = {
  program_id: number;
  type: string;
  min_amount_cents: number | null;
  max_amount_cents: number | null;
  currency_code: string | null;
  notes: string | null;
};

type CriterionRow = {
  program_id: number;
  kind: string;
  operator: string;
  value: string;
};

type TagRow = {
  program_id: number;
  tag: string;
};

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  } catch {
    return [];
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildProgram(row: ProgramRow, benefits: BenefitRow[], criteria: CriterionRow[], tags: string[]): NormalizedProgram {
  return {
    uid: row.uid,
    country_code: row.country_code as NormalizedProgram['country_code'],
    authority_level: row.authority_level as NormalizedProgram['authority_level'],
    jurisdiction_code: row.jurisdiction_code,
    title: row.title,
    summary: row.summary ?? undefined,
    benefit_type: (row.benefit_type ?? undefined) as NormalizedProgram['benefit_type'],
    status: row.status as NormalizedProgram['status'],
    industry_codes: parseJsonArray(row.industry_codes),
    start_date: row.start_date ?? undefined,
    end_date: row.end_date ?? undefined,
    url: row.url ?? undefined,
    source_id: row.source_id ?? undefined,
    benefits: benefits.map((b) => ({
      type: b.type,
      min_amount_cents: b.min_amount_cents ?? undefined,
      max_amount_cents: b.max_amount_cents ?? undefined,
      currency_code: b.currency_code ?? undefined,
      notes: b.notes ?? undefined
    })),
    criteria: criteria.map((c) => ({
      kind: c.kind,
      operator: c.operator as NormalizedProgram['criteria'][number]['operator'],
      value: c.value
    })),
    tags
  };
}

export async function runEnrichmentBackfill(env: EnrichmentBackfillEnv): Promise<void> {
  const programRows = await env.DB.prepare(
    `SELECT id, uid, country_code, authority_level, jurisdiction_code, title, summary, benefit_type, status, industry_codes, start_date, end_date, url, source_id FROM programs`
  ).all<ProgramRow>();

  const programs = programRows.results ?? [];
  if (programs.length === 0) {
    return;
  }

  const [benefitRows, criterionRows, tagRows] = await Promise.all([
    env.DB.prepare(
      `SELECT program_id, type, min_amount_cents, max_amount_cents, currency_code, notes FROM benefits`
    ).all<BenefitRow>(),
    env.DB.prepare(`SELECT program_id, kind, operator, value FROM criteria`).all<CriterionRow>(),
    env.DB.prepare(`SELECT program_id, tag FROM tags`).all<TagRow>()
  ]);

  const benefitMap = new Map<number, BenefitRow[]>();
  for (const row of benefitRows.results ?? []) {
    const list = benefitMap.get(row.program_id) ?? [];
    list.push(row);
    benefitMap.set(row.program_id, list);
  }
  const criterionMap = new Map<number, CriterionRow[]>();
  for (const row of criterionRows.results ?? []) {
    const list = criterionMap.get(row.program_id) ?? [];
    list.push(row);
    criterionMap.set(row.program_id, list);
  }
  const tagMap = new Map<number, string[]>();
  for (const row of tagRows.results ?? []) {
    const list = tagMap.get(row.program_id) ?? [];
    list.push(row.tag);
    tagMap.set(row.program_id, list);
  }

  const statements: D1PreparedStatement[] = [];
  const now = Date.now();

  for (const row of programs) {
    const program = buildProgram(
      row,
      benefitMap.get(row.id) ?? [],
      criterionMap.get(row.id) ?? [],
      tagMap.get(row.id) ?? []
    );
    const enriched = await enrichNaics(program, env);

    const originalCodes = program.industry_codes ?? [];
    const newCodes = enriched.industry_codes ?? [];
    const originalTags = program.tags ?? [];
    const newTags = enriched.tags ?? [];

    const codesChanged = !arraysEqual(originalCodes, newCodes);
    const tagsChanged = !arraysEqual(originalTags, newTags);

    if (!codesChanged && !tagsChanged) {
      continue;
    }

    if (codesChanged) {
      statements.push(
        env.DB.prepare(`UPDATE programs SET industry_codes = json(?), updated_at = ? WHERE id = ?`).bind(
          JSON.stringify(newCodes),
          now,
          row.id
        )
      );
    }

    if (tagsChanged) {
      statements.push(env.DB.prepare(`DELETE FROM tags WHERE program_id = ?`).bind(row.id));
      for (const tag of newTags) {
        statements.push(env.DB.prepare(`INSERT INTO tags (program_id, tag) VALUES (?, ?)`).bind(row.id, tag));
      }
    }
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
}
