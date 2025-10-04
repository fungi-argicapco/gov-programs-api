/// <reference types="bun-types" />

type Prepared = {
  bind: (...values: any[]) => Prepared;
  first: <T = any>() => Promise<T | null>;
  run: () => Promise<{ success: boolean; meta: { changes: number; duration: number; last_row_id: number | null } }>;
  all: <T = any>() => Promise<{ results: T[] }>;
};

type D1Like = D1Database & {
  __db__: any;
};

type SqliteDatabaseConstructor = new (filename: string) => {
  prepare(sql: string): any;
  exec(sql: string): void;
};

async function getDatabaseCtor(): Promise<SqliteDatabaseConstructor> {
  try {
    const mod = await import('bun:sqlite');
    return mod.Database as unknown as SqliteDatabaseConstructor;
  } catch {
    const better = await import('better-sqlite3');
    return better.default as unknown as SqliteDatabaseConstructor;
  }
}

const Database = await getDatabaseCtor();

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
          changes: Number(info.changes ?? 0),
          duration: 0,
          last_row_id: Number(info.lastInsertRowid ?? 0)
        }
      };
    },
    all: async <T = any>() => {
      const rows = stmt.all(...params);
      return { results: (rows ?? []) as T[] };
    }
  };
}

export function createTestDB(): D1Like {
  const sqlite = new Database(':memory:');
  const db: any = {
    __db__: sqlite,
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
    }
  };
  return db as D1Like;
}
