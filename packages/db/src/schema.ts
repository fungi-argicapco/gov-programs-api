import { relations } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const programs = sqliteTable('programs', {
  id: text('id').primaryKey(),
  sourceId: text('source_id'),
  sourceName: text('source_name'),
  sourceUrl: text('source_url'),
  title: text('title').notNull(),
  summary: text('summary'),
  authorityLevel: text('authority_level'),
  stateCode: text('state_code'),
  industries: text('industries').notNull().default('[]'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  status: text('status').notNull().default('unknown'),
  benefitType: text('benefit_type'),
  websiteUrl: text('website_url'),
  applicationUrl: text('application_url'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const programCriteria = sqliteTable('program_criteria', {
  id: text('id').primaryKey(),
  programId: text('program_id').notNull().references(() => programs.id, {
    onDelete: 'cascade'
  }),
  category: text('category').notNull().default('other'),
  label: text('label').notNull(),
  value: text('value'),
  notes: text('notes'),
  position: integer('position').notNull().default(0)
});

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  label: text('label').notNull(),
  description: text('description')
}, (table) => ({
  slugUnique: uniqueIndex('tags_slug_unique').on(table.slug)
}));

export const programTags = sqliteTable('program_tags', {
  programId: text('program_id').notNull().references(() => programs.id, {
    onDelete: 'cascade'
  }),
  tagId: text('tag_id').notNull().references(() => tags.id, {
    onDelete: 'cascade'
  })
}, (table) => ({
  pk: primaryKey({ columns: [table.programId, table.tagId] })
}));

export const programsRelations = relations(programs, ({ many }) => ({
  criteria: many(programCriteria),
  programTags: many(programTags)
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  programTags: many(programTags)
}));

export const programCriteriaRelations = relations(programCriteria, ({ one }) => ({
  program: one(programs, {
    fields: [programCriteria.programId],
    references: [programs.id]
  })
}));

export const programTagsRelations = relations(programTags, ({ one }) => ({
  program: one(programs, {
    fields: [programTags.programId],
    references: [programs.id]
  }),
  tag: one(tags, {
    fields: [programTags.tagId],
    references: [tags.id]
  })
}));
