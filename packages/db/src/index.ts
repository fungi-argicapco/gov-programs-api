export * from './schema.js';
export * from './queries.js';

import { drizzle } from 'drizzle-orm/d1';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema.js';
import { createProgramsFtsTable, createProgramsFtsTriggers } from './schema.js';
import { ProgramQueries } from './queries.js';

export function createDatabase(d1: D1Database): DrizzleD1Database<typeof schema> {
  return drizzle(d1, { schema });
}

export function createProgramQueries(db: DrizzleD1Database<typeof schema>): ProgramQueries {
  return new ProgramQueries(db);
}

/**
 * Initialize the database with FTS5 tables and triggers
 */
export async function initializeDatabase(db: DrizzleD1Database<typeof schema>): Promise<void> {
  // Create FTS5 virtual table
  await db.run(createProgramsFtsTable);

  // Create triggers to keep FTS5 in sync
  for (const trigger of createProgramsFtsTriggers) {
    await db.run(trigger);
  }
}