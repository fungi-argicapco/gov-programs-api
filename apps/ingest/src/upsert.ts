import type { ProgramBenefit, ProgramCriterion } from '@common/types';
import { normalizeToProgram, UpsertProgramRecord } from './normalize';
import { enrichNaics } from './enrich';
import { diffJson, summarizeDiff, type DiffOptions, type JsonDiffChange } from './diff/json';

type IngestEnv = { DB: D1Database; RAW_R2?: R2Bucket; LOOKUPS_KV?: KVNamespace };

type UpsertStatus = 'inserted' | 'updated' | 'unchanged';

export type ProgramDiffRecord = {
  kind: 'insert' | 'update';
  summary: {
    totalChanges: number;
    criticalChanges: number;
    changedPaths: string[];
    criticalPaths: string[];
  };
  changes: JsonDiffChange[];
  before?: ProgramSnapshot;
  after: ProgramSnapshot;
};

export type UpsertOutcome = {
  uid: string;
  status: UpsertStatus;
  diff?: ProgramDiffRecord;
};

export type UpsertContext = {
  runId?: number | null;
};

const encoder = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const data = encoder.encode(input);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

const normalizeIndustryCodes = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const snapshotProgram = (program: {
  title?: string;
  summary?: string | null;
  status?: string;
  benefit_type?: string | null;
  industry_codes?: string[] | null;
  start_date?: string | null;
  end_date?: string | null;
  url?: string | null;
  tags?: string[];
  criteria?: ProgramCriterion[];
  benefits?: ProgramBenefit[];
  source_id?: number | null;
}) => ({
  title: program.title ?? null,
  summary: program.summary ?? null,
  status: program.status ?? null,
  benefit_type: program.benefit_type ?? null,
  industry_codes: program.industry_codes ?? [],
  start_date: program.start_date ?? null,
  end_date: program.end_date ?? null,
  url: program.url ?? null,
  tags: program.tags ?? [],
  criteria: program.criteria ?? [],
  benefits: program.benefits ?? [],
  source_id: program.source_id ?? null
});

export type ProgramSnapshot = ReturnType<typeof snapshotProgram>;

const PROGRAM_DIFF_OPTIONS: DiffOptions = {
  ignore: ['summary'],
  critical: [
    'status',
    'benefit_type',
    'start_date',
    'end_date',
    'benefits',
    'benefits.*.min_amount_cents',
    'benefits.*.max_amount_cents',
    'benefits.*.currency_code'
  ]
};

const buildProgramDiff = (
  kind: 'insert' | 'update',
  before: ProgramSnapshot | null,
  after: ProgramSnapshot
): ProgramDiffRecord => {
  const changes = diffJson(before ?? {}, after, PROGRAM_DIFF_OPTIONS);
  const summary = summarizeDiff(changes);
  const payload: ProgramDiffRecord = {
    kind,
    summary,
    changes,
    after
  };
  if (before) {
    payload.before = before;
  }
  return payload;
};

export async function upsertPrograms(
  env: IngestEnv,
  items: UpsertProgramRecord[],
  context: UpsertContext = {}
): Promise<UpsertOutcome[]> {
  const outcomes: UpsertOutcome[] = [];
  for (const record of items) {
    const normalized = await normalizeToProgram(record.program);
    const enriched = await enrichNaics(normalized, env);
    const now = Date.now();

    const existingRow = await env.DB.prepare(
      `SELECT id, country_code, authority_level, jurisdiction_code, title, summary, benefit_type, status, industry_codes, start_date, end_date, url, source_id
       FROM programs WHERE uid = ? LIMIT 1`
    )
      .bind(enriched.uid)
      .first<any>()
      .catch(() => null);

    const sourceIdForDiff = enriched.source_id ?? existingRow?.source_id ?? null;

    let programId: number | null = null;
    let outcome: UpsertOutcome = { uid: enriched.uid, status: 'unchanged' };
    let snapshotId: number | null = null;

    if (!existingRow) {
      const insertResult = await env.DB.prepare(
        `INSERT INTO programs (uid, country_code, authority_level, jurisdiction_code, title, summary, benefit_type, status, industry_codes, start_date, end_date, url, source_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, json(?), ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          enriched.uid,
          enriched.country_code,
          enriched.authority_level,
          enriched.jurisdiction_code,
          enriched.title,
          enriched.summary ?? null,
          enriched.benefit_type ?? null,
          enriched.status,
          JSON.stringify(enriched.industry_codes ?? []),
          enriched.start_date ?? null,
          enriched.end_date ?? null,
          enriched.url ?? null,
          enriched.source_id ?? null,
          now,
          now
        )
        .run();

      const insertedId = (insertResult as any)?.meta?.last_row_id;
      if (typeof insertedId === 'number' && insertedId > 0) {
        programId = insertedId;
      } else {
        const row = await env.DB.prepare(`SELECT id FROM programs WHERE uid = ?`).bind(enriched.uid).first<{ id: number }>();
        programId = row?.id ?? null;
      }

      if (programId) {
        await writeRelations(env, programId, enriched.benefits ?? [], enriched.criteria ?? [], enriched.tags ?? []);
      }

      const afterSnapshot = snapshotProgram({
        ...enriched,
        industry_codes: enriched.industry_codes ?? [],
        benefits: enriched.benefits ?? [],
        criteria: enriched.criteria ?? [],
        tags: enriched.tags ?? []
      });
      const diffRecord = buildProgramDiff('insert', null, afterSnapshot);
      outcome = {
        uid: enriched.uid,
        status: 'inserted',
        diff: diffRecord
      };

      await recordProgramDiff(env, {
        uid: enriched.uid,
        sourceId: sourceIdForDiff,
        runId: context.runId ?? null,
        diff: diffRecord
      });
    } else {
      programId = Number(existingRow.id);
      const existingRelations = await readRelations(env, programId);
      const beforeSnapshot = snapshotProgram({
        title: existingRow.title,
        summary: existingRow.summary,
        status: existingRow.status,
        benefit_type: existingRow.benefit_type,
        industry_codes: normalizeIndustryCodes(existingRow.industry_codes),
        start_date: existingRow.start_date,
        end_date: existingRow.end_date,
        url: existingRow.url,
        tags: existingRelations.tags,
        criteria: existingRelations.criteria,
        benefits: existingRelations.benefits,
        source_id: existingRow.source_id ?? null
      });
      const afterSnapshot = snapshotProgram({
        ...enriched,
        industry_codes: enriched.industry_codes ?? [],
        benefits: enriched.benefits ?? [],
        criteria: enriched.criteria ?? [],
        tags: enriched.tags ?? []
      });

      const diffRecord = buildProgramDiff('update', beforeSnapshot, afterSnapshot);

      if (diffRecord.changes.length === 0) {
        outcome = { uid: enriched.uid, status: 'unchanged' };
      } else {
        await env.DB.prepare(
          `UPDATE programs SET country_code = ?, authority_level = ?, jurisdiction_code = ?, title = ?, summary = ?, benefit_type = ?, status = ?, industry_codes = json(?), start_date = ?, end_date = ?, url = ?, source_id = ?, updated_at = ? WHERE id = ?`
        )
          .bind(
            enriched.country_code,
            enriched.authority_level,
            enriched.jurisdiction_code,
            enriched.title,
            enriched.summary ?? null,
            enriched.benefit_type ?? null,
            enriched.status,
            JSON.stringify(enriched.industry_codes ?? []),
            enriched.start_date ?? null,
            enriched.end_date ?? null,
            enriched.url ?? null,
            enriched.source_id ?? existingRow.source_id ?? null,
            now,
            programId
          )
          .run();

        await env.DB.prepare(`DELETE FROM benefits WHERE program_id = ?`).bind(programId).run();
        await env.DB.prepare(`DELETE FROM criteria WHERE program_id = ?`).bind(programId).run();
        await env.DB.prepare(`DELETE FROM tags WHERE program_id = ?`).bind(programId).run();
        await writeRelations(env, programId, enriched.benefits ?? [], enriched.criteria ?? [], enriched.tags ?? []);

        outcome = {
          uid: enriched.uid,
          status: 'updated',
          diff: diffRecord
        };

        await recordProgramDiff(env, {
          uid: enriched.uid,
          sourceId: sourceIdForDiff,
          runId: context.runId ?? null,
          diff: diffRecord
        });
      }
    }

    if (record.raw !== undefined && env.RAW_R2 && (record.adapter || record.source_url)) {
      try {
        const rawString = typeof record.raw === 'string' ? record.raw : JSON.stringify(record.raw);
        const rawHash = await sha256Hex(rawString);
        const key = `programs/${enriched.uid}/${now}.json`;
        await env.RAW_R2.put(key, rawString, { httpMetadata: { contentType: 'application/json' } });
        const snapshotResult = await env.DB.prepare(
          `INSERT INTO snapshots (program_id, raw_key, raw_hash, fetched_at, adapter, source_url)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(
            programId,
            key,
            rawHash,
            now,
            record.adapter,
            record.source_url ?? null
          )
          .run();
        const insertedId = Number((snapshotResult as any)?.meta?.last_row_id ?? 0);
        if (Number.isFinite(insertedId) && insertedId > 0) {
          snapshotId = insertedId;
        } else if (programId) {
          const row = await env.DB.prepare(
            `SELECT id FROM snapshots WHERE program_id = ? ORDER BY fetched_at DESC, id DESC LIMIT 1`
          )
            .bind(programId)
            .first<{ id: number }>();
          if (row?.id) {
            snapshotId = Number(row.id);
          }
        }
      } catch {
        // Ignore snapshot errors to avoid blocking ingestion.
      }
    }

    if (snapshotId && outcome.diff && programId) {
      await recordSnapshotDiff(env, {
        uid: enriched.uid,
        programId,
        snapshotId,
        runId: context.runId ?? null,
        sourceId: sourceIdForDiff,
        diff: outcome.diff
      });
    }

    outcomes.push(outcome);
  }
  return outcomes;
}

async function writeRelations(env: IngestEnv, programId: number, benefits: ProgramBenefit[], criteria: ProgramCriterion[], tags: string[]) {
  if (benefits.length > 0) {
    await env.DB.batch(
      benefits.map((b) =>
        env.DB.prepare(
          `INSERT INTO benefits (program_id, type, min_amount_cents, max_amount_cents, currency_code, notes)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(programId, b.type, b.min_amount_cents ?? null, b.max_amount_cents ?? null, b.currency_code ?? null, b.notes ?? null)
      )
    );
  }
  if (criteria.length > 0) {
    await env.DB.batch(
      criteria.map((c) =>
        env.DB.prepare(`INSERT INTO criteria (program_id, kind, operator, value) VALUES (?, ?, ?, ?)`)
          .bind(programId, c.kind, c.operator, c.value)
      )
    );
  }
  if (tags.length > 0) {
    await env.DB.batch(
      tags.map((tag) => env.DB.prepare(`INSERT INTO tags (program_id, tag) VALUES (?, ?)`).bind(programId, tag))
    );
  }
}

async function readRelations(env: IngestEnv, programId: number) {
  const [benefitRows, criteriaRows, tagRows] = await Promise.all([
    env.DB.prepare(`SELECT type, min_amount_cents, max_amount_cents, currency_code, notes FROM benefits WHERE program_id = ?`).bind(programId).all<any>(),
    env.DB.prepare(`SELECT kind, operator, value FROM criteria WHERE program_id = ?`).bind(programId).all<any>(),
    env.DB.prepare(`SELECT tag FROM tags WHERE program_id = ?`).bind(programId).all<any>()
  ]);
  return {
    benefits: (benefitRows.results ?? []).map((row: any) => ({
      type: row.type,
      min_amount_cents: row.min_amount_cents ?? null,
      max_amount_cents: row.max_amount_cents ?? null,
      currency_code: row.currency_code ?? null,
      notes: row.notes ?? null
    })),
    criteria: (criteriaRows.results ?? []).map((row: any) => ({
      kind: row.kind,
      operator: row.operator,
      value: row.value
    })),
    tags: (tagRows.results ?? []).map((row: any) => row.tag)
  };
}

type RecordProgramDiffInput = {
  uid: string;
  sourceId: number | null;
  runId: number | null;
  diff: ProgramDiffRecord;
};

async function recordProgramDiff(env: IngestEnv, input: RecordProgramDiffInput) {
  const payload = {
    diff: JSON.stringify(input.diff),
    summary: JSON.stringify(input.diff.summary),
    critical: input.diff.summary.criticalChanges > 0 ? 1 : 0
  };
  await env.DB.prepare(
    `INSERT INTO program_diffs (program_uid, source_id, run_id, ts, diff, summary, critical)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      input.uid,
      input.sourceId ?? null,
      input.runId ?? null,
      Date.now(),
      payload.diff,
      payload.summary,
      payload.critical
    )
    .run();
}

type RecordSnapshotDiffInput = {
  uid: string;
  programId: number;
  snapshotId: number;
  sourceId: number | null;
  runId: number | null;
  diff: ProgramDiffRecord;
};

async function recordSnapshotDiff(env: IngestEnv, input: RecordSnapshotDiffInput) {
  const prevRow = await env.DB.prepare(
    `SELECT id FROM snapshots WHERE program_id = ? AND id != ? ORDER BY fetched_at DESC, id DESC LIMIT 1`
  )
    .bind(input.programId, input.snapshotId)
    .first<{ id: number }>();
  const payload = {
    diff: JSON.stringify(input.diff),
    critical: input.diff.summary.criticalChanges > 0 ? 1 : 0
  };
  await env.DB.prepare(
    `INSERT INTO snapshot_diffs (program_uid, snapshot_id, prev_snapshot_id, run_id, source_id, ts, diff, critical)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      input.uid,
      input.snapshotId,
      prevRow?.id ?? null,
      input.runId ?? null,
      input.sourceId ?? null,
      Date.now(),
      payload.diff,
      payload.critical
    )
    .run();
}
