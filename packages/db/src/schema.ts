import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const programs = sqliteTable(
  'programs',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    type: text('type').notNull(), // funding, credit, rebate, incentive
    status: text('status').notNull(), // active, inactive, pending, expired
    geographyLevel: text('geography_level').notNull(), // local, regional, state, federal
    state: text('state'), // US state code
    city: text('city'),
    county: text('county'),
    region: text('region'),
    industries: text('industries').notNull(), // JSON array of industry categories
    eligibilityRequirements: text('eligibility_requirements').notNull(),
    benefitAmount: text('benefit_amount'),
    applicationDeadline: text('application_deadline'), // ISO datetime
    programStartDate: text('program_start_date'), // ISO datetime
    programEndDate: text('program_end_date'), // ISO datetime
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    websiteUrl: text('website_url'),
    applicationUrl: text('application_url'),
    tags: text('tags').default('[]'), // JSON array of tags
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastVerified: text('last_verified'),
  },
  (table) => ({
    typeIdx: index('type_idx').on(table.type),
    statusIdx: index('status_idx').on(table.status),
    geographyIdx: index('geography_idx').on(table.geographyLevel),
    stateIdx: index('state_idx').on(table.state),
    cityIdx: index('city_idx').on(table.city),
    deadlineIdx: index('deadline_idx').on(table.applicationDeadline),
    startDateIdx: index('start_date_idx').on(table.programStartDate),
    endDateIdx: index('end_date_idx').on(table.programEndDate),
    createdAtIdx: index('created_at_idx').on(table.createdAt),
    updatedAtIdx: index('updated_at_idx').on(table.updatedAt),
  })
);

// FTS5 virtual table for full-text search
export const programsFts = sqliteTable('programs_fts', {
  rowid: integer('rowid').primaryKey(),
  title: text('title'),
  description: text('description'),
  eligibilityRequirements: text('eligibility_requirements'),
  tags: text('tags'),
});

// SQL for creating the FTS5 virtual table
export const createProgramsFtsTable = sql`
  CREATE VIRTUAL TABLE IF NOT EXISTS programs_fts USING fts5(
    title,
    description,
    eligibility_requirements,
    tags,
    content='programs',
    content_rowid='rowid'
  );
`;

// Triggers to keep FTS5 table in sync
export const createProgramsFtsTriggers = [
  sql`
    CREATE TRIGGER IF NOT EXISTS programs_fts_insert AFTER INSERT ON programs
    BEGIN
      INSERT INTO programs_fts(rowid, title, description, eligibility_requirements, tags)
      VALUES (NEW.rowid, NEW.title, NEW.description, NEW.eligibility_requirements, NEW.tags);
    END;
  `,
  sql`
    CREATE TRIGGER IF NOT EXISTS programs_fts_delete AFTER DELETE ON programs
    BEGIN
      INSERT INTO programs_fts(programs_fts, rowid, title, description, eligibility_requirements, tags)
      VALUES ('delete', OLD.rowid, OLD.title, OLD.description, OLD.eligibility_requirements, OLD.tags);
    END;
  `,
  sql`
    CREATE TRIGGER IF NOT EXISTS programs_fts_update AFTER UPDATE ON programs
    BEGIN
      INSERT INTO programs_fts(programs_fts, rowid, title, description, eligibility_requirements, tags)
      VALUES ('delete', OLD.rowid, OLD.title, OLD.description, OLD.eligibility_requirements, OLD.tags);
      INSERT INTO programs_fts(rowid, title, description, eligibility_requirements, tags)
      VALUES (NEW.rowid, NEW.title, NEW.description, NEW.eligibility_requirements, NEW.tags);
    END;
  `,
];

export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;