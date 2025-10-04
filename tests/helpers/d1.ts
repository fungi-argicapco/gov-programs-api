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

type SqliteDatabase = {
  prepare(sql: string): any;
  exec(sql: string): void;
};

type SqliteDatabaseConstructor = new (filename: string) => SqliteDatabase;

function asCtor(candidate: unknown): SqliteDatabaseConstructor | null {
  if (typeof candidate === 'function') {
    return candidate as SqliteDatabaseConstructor;
  }

  if (candidate && typeof candidate === 'object') {
    const mod = candidate as Record<string, unknown>;

    if (typeof mod.default === 'function') {
      return mod.default as SqliteDatabaseConstructor;
    }

    if (typeof mod.Database === 'function') {
      return mod.Database as SqliteDatabaseConstructor;
    }
  }

  return null;
}

let cachedCtor: SqliteDatabaseConstructor | null = null;

async function getDatabaseCtor(): Promise<SqliteDatabaseConstructor> {
  if (cachedCtor) {
    return cachedCtor;
  }

  const attempts: Array<() => Promise<unknown>> = [
    async () => await import('bun:sqlite'),
    async () => await import('better-sqlite3')
  ];

  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      const mod = await attempt();
      const ctor = asCtor(mod);
      if (ctor) {
        cachedCtor = ctor;
        return ctor;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to load SQLite test driver. Last error: ${
      lastError instanceof Error ? lastError.message : 'unknown'
    }`
  );
}

const Database = await getDatabaseCtor();

function createPreparedStatement(stmt: any, params: any[] = []): Prepared {
  const createBindingObject = () =>
    params.reduce<Record<number, unknown>>((acc, value, index) => {
      acc[index + 1] = value;
      return acc;
    }, {});

  return {
    bind: (...values: any[]) => createPreparedStatement(stmt, values),
    first: async <T = any>() => {
      try {
        const row = stmt.get(...params);
        return (row ?? null) as T | null;
      } catch (error) {
        if (error instanceof RangeError && error.message.includes('parameter')) {
          const row = stmt.get(createBindingObject());
          return (row ?? null) as T | null;
        }
        return null;
      }
    },
    run: async () => {
      try {
        const info = stmt.run(...params);
        return {
          success: true,
          meta: {
            changes: Number(info.changes ?? 0),
            duration: 0,
            last_row_id: Number(info.lastInsertRowid ?? 0)
          }
        };
      } catch (error) {
        if (error instanceof RangeError && error.message.includes('parameter')) {
          const info = stmt.run(createBindingObject());
          return {
            success: true,
            meta: {
              changes: Number(info.changes ?? 0),
              duration: 0,
              last_row_id: Number(info.lastInsertRowid ?? 0)
            }
          };
        }
        throw error;
      }
    },
    all: async <T = any>() => {
      try {
        const rows = stmt.all(...params);
        return { results: (rows ?? []) as T[] };
      } catch (error) {
        if (error instanceof RangeError && error.message.includes('parameter')) {
          const rows = stmt.all(createBindingObject());
          return { results: (rows ?? []) as T[] };
        }
        return { results: [] as T[] };
      }
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
