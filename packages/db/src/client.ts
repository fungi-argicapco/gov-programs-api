import { drizzle } from 'drizzle-orm/d1';

export type DrizzleDatabase = ReturnType<typeof drizzle>;

export const createDb = (database: D1Database): DrizzleDatabase => drizzle(database);
