#!/usr/bin/env bun
import { mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

import { runCatalogOnce } from '../apps/ingest/src/catalog';
import { noopMetricsAdapter } from '../apps/ingest/src/metrics';

type Prepared = {
  bind: (...values: any[]) => Prepared;
  first: <T = any>() => Promise<T | null>;
  run: () => Promise<{ success: boolean; meta: { changes: number; duration: number; last_row_id: number } }>;
  all: <T = any>() => Promise<{ results: T[] }>;
};

type D1Like = D1Database & { close: () => void };

type CliOptions = {
  sources: string[];
  dbPath: string;
};

async function getSqliteConstructor(): Promise<any> {
  try {
    const mod = await import('bun:sqlite');
    return mod.Database;
  } catch {
    const mod = await import('better-sqlite3');
    return mod.default;
  }
}

function createPreparedStatement(stmt: any, params: any[] = []): Prepared {
  return {
    bind: (...values: any[]) => createPreparedStatement(stmt, values),
    first: async <T = any>() => {
      try {
        const row = stmt.get(...params);
        return (row ?? null) as T | null;
      } catch {
        return null;
      }
    },
    run: async () => {
      const info = stmt.run(...params);
      return {
        success: true,
        meta: {
          changes: Number(info?.changes ?? 0),
          duration: 0,
          last_row_id: Number(info?.lastInsertRowid ?? 0)
        }
      };
    },
    all: async <T = any>() => {
      const rows = stmt.all(...params);
      return { results: (rows ?? []) as T[] };
    }
  };
}

async function createLocalD1(path: string): Promise<D1Like> {
  const Sqlite = await getSqliteConstructor();
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Sqlite(path);
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const db: any = {
    prepare(sql: string) {
      const stmt = sqlite.prepare(sql);
      return createPreparedStatement(stmt);
    },
    async batch(statements: Prepared[]) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
    async exec(sql: string) {
      sqlite.exec(sql);
      return { success: true };
    },
    close() {
      if (typeof sqlite.close === 'function') {
        sqlite.close();
      }
    }
  };

  return db as D1Like;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const sources: string[] = [];
  let dbPath = resolve(process.cwd(), 'data', 'ingest.dev.sqlite');

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--source' && args[i + 1]) {
      sources.push(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--source=')) {
      const value = arg.split('=')[1] ?? '';
      if (value) {
        value.split(',').map((token) => token.trim()).filter(Boolean).forEach((token) => sources.push(token));
      }
      continue;
    }
    if (arg === '--db' && args[i + 1]) {
      dbPath = resolve(process.cwd(), args[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--db=')) {
      const value = arg.split('=')[1] ?? '';
      if (value) {
        dbPath = resolve(process.cwd(), value);
      }
      continue;
    }
  }

  return { sources, dbPath };
}

async function applyMigrations(db: D1Like) {
  const migrationsDir = resolve(process.cwd(), 'migrations');
  if (!existsSync(migrationsDir)) {
    return;
  }
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    await db.exec(sql);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toFixed(1)}s`;
}

function formatSummary(result: Awaited<ReturnType<typeof runCatalogOnce>>[number]): string {
  const statusIcon = result.status === 'ok' ? '✅' : result.status === 'partial' ? '⚠️' : '❌';
  const diff = result.diffSummary;
  const criticalNote = diff.criticalPrograms > 0 ? `, ${diff.criticalPrograms} critical` : '';
  return [
    `${statusIcon} ${result.source.id} – fetched ${result.fetched}, inserted ${result.inserted}, updated ${result.updated}, unchanged ${result.unchanged}, errors ${result.errors}`,
    `   duration ${formatDuration(result.durationMs)}; changed ${diff.totalProgramsChanged} program(s)${criticalNote}`
  ].join('\n');
}

function formatSamples(result: Awaited<ReturnType<typeof runCatalogOnce>>[number]): string {
  const samples = result.diffSummary.samples;
  if (samples.length === 0) {
    return '   No diff samples available.';
  }
  const lines: string[] = [];
  for (const sample of samples) {
    const critical = sample.diff.summary.criticalChanges > 0 ? ' (critical)' : '';
    const fields = sample.diff.summary.changedPaths.slice(0, 5).join(', ') || 'unknown fields';
    lines.push(`   • ${sample.uid}${critical}: ${fields}`);
  }
  return lines.join('\n');
}

async function main() {
  const options = parseArgs();
  const db = await createLocalD1(options.dbPath);
  try {
    await applyMigrations(db);
    const results = await runCatalogOnce(
      { DB: db } as any,
      new Date(),
      {
        sourceIds: options.sources.length > 0 ? options.sources : undefined,
        metricsAdapter: noopMetricsAdapter
      }
    );

    if (results.length === 0) {
      console.log('No sources matched the provided filters.');
      return;
    }

    for (const result of results) {
      console.log(formatSummary(result));
      if (result.notes.length > 0) {
        console.log(`   Notes: ${result.notes.join('; ')}`);
      }
      console.log(formatSamples(result));
      console.log('');
    }
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error('ingest:once failed', error);
  process.exitCode = 1;
});
