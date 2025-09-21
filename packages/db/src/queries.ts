import { eq, and, like, sql, desc, asc } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema.js';
import { programs, programsFts, type Program, type NewProgram } from './schema.js';
import type { SearchQuery } from '@gov-programs/common';
import { buildFTSQuery } from '@gov-programs/common';

export class ProgramQueries {
  constructor(private db: DrizzleD1Database<typeof schema>) {}

  /**
   * Create a new program
   */
  async createProgram(program: NewProgram): Promise<Program> {
    const [created] = await this.db.insert(programs).values(program).returning();
    return created!;
  }

  /**
   * Get program by ID
   */
  async getProgramById(id: string): Promise<Program | null> {
    const result = await this.db.select().from(programs).where(eq(programs.id, id)).limit(1);
    return result[0] || null;
  }

  /**
   * Update program
   */
  async updateProgram(id: string, updates: Partial<NewProgram>): Promise<Program | null> {
    const [updated] = await this.db
      .update(programs)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(programs.id, id))
      .returning();
    return updated || null;
  }

  /**
   * Delete program
   */
  async deleteProgram(id: string): Promise<boolean> {
    const result = await this.db.delete(programs).where(eq(programs.id, id));
    return result.success && result.meta.changes > 0;
  }

  /**
   * Search programs with full-text search and filters
   */
  async searchPrograms(query: SearchQuery): Promise<{
    programs: Program[];
    total: number;
  }> {
    const conditions: any[] = [];
    let useFullTextSearch = false;
    let ftsQuery = '';

    // Build WHERE conditions
    if (query.type) {
      conditions.push(eq(programs.type, query.type));
    }

    if (query.geographyLevel) {
      conditions.push(eq(programs.geographyLevel, query.geographyLevel));
    }

    if (query.state) {
      conditions.push(eq(programs.state, query.state));
    }

    if (query.city) {
      conditions.push(like(programs.city, `%${query.city}%`));
    }

    if (query.status) {
      conditions.push(eq(programs.status, query.status));
    }

    if (query.startDate) {
      conditions.push(
        sql`${programs.programStartDate} >= ${query.startDate} OR ${programs.programStartDate} IS NULL`
      );
    }

    if (query.endDate) {
      conditions.push(
        sql`${programs.programEndDate} <= ${query.endDate} OR ${programs.programEndDate} IS NULL`
      );
    }

    if (query.industries && query.industries.length > 0) {
      const industryConditions = query.industries.map(industry =>
        sql`json_extract(${programs.industries}, '$') LIKE ${'%"' + industry + '"%'}`
      );
      conditions.push(sql`(${sql.join(industryConditions, sql` OR `)})`);
    }

    // Full-text search
    if (query.query && query.query.trim()) {
      useFullTextSearch = true;
      ftsQuery = buildFTSQuery(query.query);
    }

    const limit = query.limit || 20;
    const offset = query.offset || 0;

    let searchResults: Program[];
    let totalCount: number;

    if (useFullTextSearch) {
      // Use FTS5 for text search combined with filters
      const ftsCondition = sql`${programsFts}.rowid IN (
        SELECT rowid FROM programs_fts WHERE programs_fts MATCH ${ftsQuery}
        ORDER BY rank
      )`;

      const allConditions = conditions.length > 0 
        ? [ftsCondition, ...conditions]
        : [ftsCondition];

      const whereClause = allConditions.length > 0 ? and(...allConditions) : undefined;

      // Get results
      const resultsQuery = this.db
        .select()
        .from(programs)
        .where(whereClause)
        .orderBy(desc(programs.updatedAt))
        .limit(limit)
        .offset(offset);

      searchResults = await resultsQuery;

      // Get total count
      const countQuery = this.db
        .select({ count: sql<number>`count(*)` })
        .from(programs)
        .where(whereClause);

      const countResult = await countQuery;
      totalCount = countResult[0]?.count || 0;
    } else {
      // Regular search without FTS
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get results
      const resultsQuery = this.db
        .select()
        .from(programs)
        .where(whereClause)
        .orderBy(desc(programs.updatedAt))
        .limit(limit)
        .offset(offset);

      searchResults = await resultsQuery;

      // Get total count
      const countQuery = this.db
        .select({ count: sql<number>`count(*)` })
        .from(programs)
        .where(whereClause);

      const countResult = await countQuery;
      totalCount = countResult[0]?.count || 0;
    }

    return {
      programs: searchResults,
      total: totalCount,
    };
  }

  /**
   * Get programs by geography
   */
  async getProgramsByGeography(
    geographyLevel: string,
    state?: string,
    city?: string,
    limit = 20,
    offset = 0
  ): Promise<Program[]> {
    const conditions = [eq(programs.geographyLevel, geographyLevel)];

    if (state) {
      conditions.push(eq(programs.state, state));
    }

    if (city) {
      conditions.push(like(programs.city, `%${city}%`));
    }

    return await this.db
      .select()
      .from(programs)
      .where(and(...conditions))
      .orderBy(desc(programs.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get programs by industry
   */
  async getProgramsByIndustry(
    industry: string,
    limit = 20,
    offset = 0
  ): Promise<Program[]> {
    return await this.db
      .select()
      .from(programs)
      .where(sql`json_extract(${programs.industries}, '$') LIKE ${'%"' + industry + '"%'}`)
      .orderBy(desc(programs.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get active programs (not expired)
   */
  async getActivePrograms(limit = 20, offset = 0): Promise<Program[]> {
    return await this.db
      .select()
      .from(programs)
      .where(
        and(
          eq(programs.status, 'active'),
          sql`(${programs.programEndDate} IS NULL OR ${programs.programEndDate} > datetime('now'))`
        )
      )
      .orderBy(desc(programs.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get programs expiring soon (within 30 days)
   */
  async getProgramsExpiringSoon(limit = 20, offset = 0): Promise<Program[]> {
    return await this.db
      .select()
      .from(programs)
      .where(
        and(
          eq(programs.status, 'active'),
          sql`${programs.programEndDate} IS NOT NULL AND ${programs.programEndDate} <= datetime('now', '+30 days')`
        )
      )
      .orderBy(asc(programs.programEndDate))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get statistics about programs
   */
  async getProgramStats(): Promise<{
    total: number;
    active: number;
    byType: Record<string, number>;
    byGeography: Record<string, number>;
  }> {
    const [totalResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(programs);

    const [activeResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(programs)
      .where(eq(programs.status, 'active'));

    const typeStats = await this.db
      .select({
        type: programs.type,
        count: sql<number>`count(*)`,
      })
      .from(programs)
      .groupBy(programs.type);

    const geographyStats = await this.db
      .select({
        geography: programs.geographyLevel,
        count: sql<number>`count(*)`,
      })
      .from(programs)
      .groupBy(programs.geographyLevel);

    return {
      total: totalResult?.count || 0,
      active: activeResult?.count || 0,
      byType: Object.fromEntries(typeStats.map(s => [s.type, s.count])),
      byGeography: Object.fromEntries(geographyStats.map(s => [s.geography, s.count])),
    };
  }
}