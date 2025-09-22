import type { ProgramBenefit, ProgramCriterion } from '@common/types';
import { normalizeToProgram, UpsertProgramRecord } from './normalize';

const encoder = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const data = encoder.encode(input);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

type IngestEnv = { DB: D1Database; RAW_R2?: R2Bucket };

export async function upsertPrograms(env: IngestEnv, items: UpsertProgramRecord[]) {
  for (const record of items) {
    const p = await normalizeToProgram(record.program);
    const now = Date.now();
    await env.DB.prepare(`
      INSERT INTO programs (uid, country_code, authority_level, jurisdiction_code, title, summary, benefit_type, status, industry_codes, start_date, end_date, url, source_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, json(?), ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid) DO UPDATE SET
        summary=excluded.summary,
        benefit_type=excluded.benefit_type,
        status=excluded.status,
        industry_codes=excluded.industry_codes,
        start_date=excluded.start_date,
        end_date=excluded.end_date,
        url=excluded.url,
        source_id=excluded.source_id,
        updated_at=excluded.updated_at
    `).bind(
      p.uid,
      p.country_code,
      p.authority_level,
      p.jurisdiction_code,
      p.title,
      p.summary ?? null,
      p.benefit_type ?? null,
      p.status,
      JSON.stringify(p.industry_codes ?? []),
      p.start_date ?? null,
      p.end_date ?? null,
      p.url ?? null,
      p.source_id ?? null,
      now,
      now
    ).run();

    const programRow = await env.DB.prepare(`SELECT id FROM programs WHERE uid = ?`).bind(p.uid).first<{ id: number }>();
    if (!programRow) continue;
    const programId = programRow.id;

    await env.DB.prepare(`DELETE FROM benefits WHERE program_id = ?`).bind(programId).run();
    await env.DB.prepare(`DELETE FROM criteria WHERE program_id = ?`).bind(programId).run();
    await env.DB.prepare(`DELETE FROM tags WHERE program_id = ?`).bind(programId).run();

    const benefitStatements = p.benefits.map((b: ProgramBenefit) =>
      env.DB.prepare(`
        INSERT INTO benefits (program_id, type, min_amount_cents, max_amount_cents, currency_code, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        programId,
        b.type,
        b.min_amount_cents ?? null,
        b.max_amount_cents ?? null,
        b.currency_code ?? null,
        b.notes ?? null
      )
    );
    if (benefitStatements.length > 0) {
      await env.DB.batch(benefitStatements);
    }

    const criterionStatements = p.criteria.map((c: ProgramCriterion) =>
      env.DB.prepare(`
        INSERT INTO criteria (program_id, kind, operator, value)
        VALUES (?, ?, ?, ?)
      `).bind(programId, c.kind, c.operator, c.value)
    );
    if (criterionStatements.length > 0) {
      await env.DB.batch(criterionStatements);
    }

    const tagStatements = p.tags.map((tag: string) =>
      env.DB.prepare(`
        INSERT INTO tags (program_id, tag)
        VALUES (?, ?)
      `).bind(programId, tag)
    );
    if (tagStatements.length > 0) {
      await env.DB.batch(tagStatements);
    }

    const rawPayload = record.raw ?? record.program;
    if (rawPayload !== undefined && env.RAW_R2) {
      const rawString = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
      const rawHash = await sha256Hex(rawString);
      const key = `programs/${p.uid}/${now}.json`;
      await env.RAW_R2.put(key, rawString, { httpMetadata: { contentType: 'application/json' } });
      await env.DB.prepare(`
        INSERT INTO snapshots (program_id, raw_key, raw_hash, fetched_at, adapter, source_url)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        programId,
        key,
        rawHash,
        now,
        record.adapter,
        record.source_url ?? null
      ).run();
    }
  }
}
