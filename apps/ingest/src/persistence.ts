import { eq } from 'drizzle-orm';
import type { ProgramT } from '@common/types';
import { createDb, programCriteria, programTags, programs, tags, type DrizzleDatabase } from '@db';

type ProgramInsert = typeof programs.$inferInsert;

export const mapProgramToRow = (program: ProgramT): ProgramInsert => {
  const industries = JSON.stringify(program.industries ?? []);
  const now = new Date().toISOString();
  return {
    id: program.id ?? crypto.randomUUID(),
    sourceId: program.sourceId ?? null,
    sourceName: program.sourceName ?? null,
    sourceUrl: program.sourceUrl ?? program.websiteUrl ?? null,
    title: program.title,
    summary: program.summary ?? null,
    authorityLevel: program.authorityLevel ?? null,
    stateCode: program.stateCode?.toUpperCase() ?? null,
    industries,
    startDate: program.startDate ?? null,
    endDate: program.endDate ?? null,
    status: program.status,
    benefitType: program.benefitType ?? null,
    websiteUrl: program.websiteUrl ?? null,
    applicationUrl: program.applicationUrl ?? null,
    createdAt: now,
    updatedAt: now
  } satisfies ProgramInsert;
};

export const persistProgram = async (env: Env, program: ProgramT, db?: DrizzleDatabase) => {
  const database = db ?? createDb(env.DB);
  const row = mapProgramToRow(program);
  const programId = row.id;

  await database.insert(programs).values(row).onConflictDoUpdate({
    target: programs.id,
    set: {
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      title: row.title,
      summary: row.summary,
      authorityLevel: row.authorityLevel,
      stateCode: row.stateCode,
      industries: row.industries,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
      benefitType: row.benefitType,
      websiteUrl: row.websiteUrl,
      applicationUrl: row.applicationUrl,
      updatedAt: row.updatedAt
    }
  });

  await database.delete(programCriteria).where(eq(programCriteria.programId, programId));
  if (program.criteria.length > 0) {
    await database.insert(programCriteria).values(
      program.criteria.map((criterion, index) => ({
        id: criterion.id ?? crypto.randomUUID(),
        programId,
        category: criterion.category,
        label: criterion.label,
        value: criterion.value ?? null,
        notes: criterion.notes ?? null,
        position: index
      }))
    );
  }

  await database.delete(programTags).where(eq(programTags.programId, programId));
  if (program.tags.length > 0) {
    for (const tag of program.tags) {
      const tagId = tag.id ?? crypto.randomUUID();
      await database.insert(tags).values({
        id: tagId,
        slug: tag.slug,
        label: tag.label,
        description: null
      }).onConflictDoUpdate({
        target: tags.slug,
        set: { label: tag.label }
      });
      await database.insert(programTags).values({ programId, tagId }).onConflictDoNothing();
    }
  }

  const tagsText = program.tags.map((tag) => tag.label).join(' ');
  const criteriaText = program.criteria.map((criterion) => `${criterion.label} ${criterion.value ?? ''}`).join(' ');

  await env.DB.prepare('DELETE FROM programs_fts WHERE program_id = ?').bind(programId).run();
  await env.DB.prepare(
    'INSERT INTO programs_fts (program_id, title, summary, tags, criteria) VALUES (?1, ?2, ?3, ?4, ?5)'
  )
    .bind(programId, program.title, program.summary ?? '', tagsText, criteriaText)
    .run();

  return programId;
};

export type Env = {
  DB: D1Database;
};
