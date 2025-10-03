#!/usr/bin/env bun
import { $ } from 'bun';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

type DatabaseHandle = {
  db: any;
  all<T = any>(sql: string, params?: unknown[]): T[];
  run(sql: string, params?: unknown[]): void;
  close(): void;
};

const args = process.argv.slice(2);
let dbPath = resolve(process.cwd(), 'data', 'ingest.dev.sqlite');
let skipIngest = false;
let purgeSynthetic = false;
let source = 'us-fed-sam-assistance';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--db' && args[i + 1]) {
    dbPath = resolve(process.cwd(), args[i + 1]);
    i += 1;
    continue;
  }
  if (arg.startsWith('--db=')) {
    dbPath = resolve(process.cwd(), arg.split('=')[1] ?? '');
    continue;
  }
  if (arg === '--skip-ingest') {
    skipIngest = true;
    continue;
  }
  if (arg === '--source' && args[i + 1]) {
    source = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--source=')) {
    source = arg.split('=')[1] ?? source;
    continue;
  }
  if (arg === '--purge') {
    purgeSynthetic = true;
    continue;
  }
}

async function openDatabase(path: string): Promise<DatabaseHandle> {
  try {
    const mod = await import('bun:sqlite');
    const db = new mod.Database(path);
    db.exec('PRAGMA foreign_keys = ON;');
    return {
      db,
      all<T = any>(sql: string, params: unknown[] = []): T[] {
        return db.prepare(sql).all(...(params as any[])) as T[];
      },
      run(sql: string, params: unknown[] = []) {
        db.prepare(sql).run(...(params as any[]));
      },
      close() {
        if (typeof db.close === 'function') {
          db.close();
        }
      }
    };
  } catch {
    const mod = await import('better-sqlite3');
    const db = new mod.default(path);
    db.exec('PRAGMA foreign_keys = ON;');
    return {
      db,
      all<T = any>(sql: string, params: unknown[] = []): T[] {
        return db.prepare(sql).all(...(params as any[])) as T[];
      },
      run(sql: string, params: unknown[] = []) {
        db.prepare(sql).run(...(params as any[]));
      },
      close() {
        if (typeof db.close === 'function') {
          db.close();
        }
      }
    };
  }
}

async function ensureIngest() {
  if (skipIngest) {
    console.log('ℹ️ Skipping ingest run (requested).');
    return;
  }

  console.log(`➡️ Running ingest for ${source}…`);
  await $`bun run scripts/ingest-once.ts --source ${source} --db ${dbPath}`;
}

async function main() {
  if (!existsSync(dbPath)) {
    console.log(`ℹ️ Database not found at ${dbPath}. It will be created by ingest.`);
  }

  await ensureIngest();

  const database = await openDatabase(dbPath);
  try {
    const rows = database.all<{
      uid: string;
      title: string;
      started_at: number;
      notes: string;
    }>(
      `WITH latest_runs AS (
          SELECT source_id, MAX(started_at) AS started_at
            FROM ingestion_runs
           GROUP BY source_id
        )
        SELECT p.uid,
               p.title,
               r.started_at,
               COALESCE(r.notes, '[]') AS notes
          FROM programs p
          JOIN latest_runs lr ON lr.source_id = p.source_id
          JOIN ingestion_runs r
            ON r.source_id = lr.source_id
           AND r.started_at = lr.started_at
         WHERE r.notes LIKE '%synthetic_data%'
         ORDER BY r.started_at DESC`
    );

    if (rows.length === 0) {
      console.log('✅ No synthetic SAM assistance entries detected.');
      if (purgeSynthetic) {
        console.log('ℹ️ Purge flag ignored because no synthetic entries remain.');
      }
      return;
    }

    console.log('⚠️ Synthetic SAM assistance entries detected:');
    for (const row of rows) {
      const timestamp = new Date(row.started_at ?? Date.now()).toISOString();
      console.log(` - ${row.uid} | ${row.title} | recorded ${timestamp}`);
      console.log(`   notes: ${row.notes}`);
    }

    if (purgeSynthetic) {
      const placeholders = rows.map(() => '?').join(', ');
      database.run(`DELETE FROM programs WHERE uid IN (${placeholders})`, rows.map((row) => row.uid));
      console.log(`✅ Purged ${rows.length} synthetic program record(s).`);
    }
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error('maintenance:sam-synthetic failed', error);
  process.exitCode = 1;
});
