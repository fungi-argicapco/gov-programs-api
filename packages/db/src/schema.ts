import { sqliteTable, integer, text, index, uniqueIndex, real } from 'drizzle-orm/sqlite-core';

export const programs = sqliteTable('programs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uid: text('uid').notNull().unique(),                                     // stable deterministic id
  countryCode: text('country_code', { length: 2 }).notNull(),              // 'US' | 'CA'
  authorityLevel: text('authority_level').notNull(),                       // federal|state|prov|territory|regional|municipal
  jurisdictionCode: text('jurisdiction_code').notNull(),                   // e.g., US-WA, US-CA, CA-ON, CA-BC
  title: text('title').notNull(),
  summary: text('summary'),
  benefitType: text('benefit_type'),                                       // grant|rebate|tax_credit|loan|guarantee|voucher|other
  status: text('status').notNull(),                                        // open|scheduled|closed|unknown
  industryCodes: text('industry_codes'),                                   // JSON array of NAICS strings
  startDate: text('start_date'),                                           // YYYY-MM-DD
  endDate: text('end_date'),                                               // YYYY-MM-DD
  url: text('url'),
  sourceId: integer('source_id'),
  createdAt: integer('created_at'),                                        // epoch ms
  updatedAt: integer('updated_at'),                                        // epoch ms
});

export const benefits = sqliteTable('benefits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  programId: integer('program_id').notNull(),
  type: text('type').notNull(),                                            // aligns with benefitType enums
  minAmountCents: integer('min_amount_cents'),
  maxAmountCents: integer('max_amount_cents'),
  currencyCode: text('currency_code', { length: 3 }),                      // USD, CAD
  notes: text('notes')
});

export const criteria = sqliteTable('criteria', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  programId: integer('program_id').notNull(),
  kind: text('kind').notNull(),                                            // e.g., industry|company_size|location|other
  operator: text('operator').notNull(),                                    // eq|in|gte|lte|contains|regex|jsonpath
  value: text('value').notNull()                                           // JSON-encoded payload
});

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  programId: integer('program_id').notNull(),
  tag: text('tag').notNull()
});

export const sources = sqliteTable('sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  url: text('url'),
  license: text('license'),
  tosUrl: text('tos_url'),
  authorityLevel: text('authority_level').notNull(),
  jurisdictionCode: text('jurisdiction_code').notNull()
});

export const snapshots = sqliteTable('snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  programId: integer('program_id'),
  rawKey: text('raw_key').notNull(),                                       // R2 key
  rawHash: text('raw_hash'),
  fetchedAt: integer('fetched_at').notNull(),                              // epoch ms
  adapter: text('adapter').notNull(),
  sourceUrl: text('source_url')
});

export const countryPlaybooks = sqliteTable('country_playbooks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  country: text('country').notNull().unique(),
  version: text('version'),
  lastUpdated: text('last_updated'),                                        // YYYY-MM-DD
  docOwner: text('doc_owner'),
  documentControl: text('document_control'),                                // JSON-encoded DocumentControl
  executiveSummary: text('executive_summary'),                              // JSON-encoded ExecutiveSummary
  snapshot: text('snapshot'),                                               // JSON-encoded CountrySnapshot
  segmentation: text('segmentation'),                                       // JSON-encoded Segmentation
  valueProposition: text('value_proposition'),                              // JSON-encoded ValueProposition
  ecosystem: text('ecosystem'),                                             // JSON-encoded CompetitiveEcosystem
  productLocalization: text('product_localization'),                        // JSON-encoded ProductLocalization
  regulatoryCompliance: text('regulatory_compliance'),                      // JSON-encoded RegulatoryCompliance
  pricingPackaging: text('pricing_packaging'),                              // JSON-encoded PricingPackaging
  goToMarket: text('go_to_market'),                                         // JSON-encoded GoToMarketPlan
  serviceSupport: text('service_support'),                                  // JSON-encoded ServiceSupport
  operationsPeople: text('operations_people'),                              // JSON-encoded OperationsPeople
  financialPlan: text('financial_plan'),                                    // JSON-encoded FinancialPlan
  milestones: text('milestones'),                                           // JSON-encoded Milestones
  raid: text('raid'),                                                       // JSON-encoded RAID
  regionalFocus: text('regional_focus'),
  createdAt: integer('created_at').notNull(),                               // epoch ms
  updatedAt: integer('updated_at').notNull()                                // epoch ms
});

export const industryMappings = sqliteTable(
  'industry_mappings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    naicsCode: text('naics_code').notNull(),
    tags: text('tags').notNull().default('[]'),
    confidence: real('confidence'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => ({
    codeIdx: uniqueIndex('idx_industry_mappings_code').on(table.naicsCode)
  })
);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  status: text('status').notNull(),
  apps: text('apps').notNull(),
  roles: text('roles').notNull().default('[]'),
  passwordHash: text('password_hash'),
  lastPasswordChange: text('last_password_change'),
  mfaEnrolled: integer('mfa_enrolled', { mode: 'boolean' }).notNull().default(false),
  lastLoginAt: text('last_login_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const mfaMethods = sqliteTable('mfa_methods', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  secret: text('secret'),
  verifiedAt: text('verified_at'),
  createdAt: text('created_at').notNull()
}, (table) => ({
  userIdx: index('idx_mfa_methods_user').on(table.userId)
}));

export const accountRequests = sqliteTable('account_requests', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  requestedApps: text('requested_apps').notNull(),
  justification: text('justification'),
  status: text('status').notNull().default('pending'),
  schemaVersion: integer('schema_version').notNull().default(1),
  createdAt: text('created_at').notNull(),
  decidedAt: text('decided_at'),
  reviewerId: text('reviewer_id'),
  reviewerComment: text('reviewer_comment')
}, (table) => ({
  statusIdx: index('idx_account_requests_status').on(table.status)
}));

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  issuedAt: text('issued_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  mfaRequired: integer('mfa_required', { mode: 'boolean' }).notNull().default(false),
  ip: text('ip'),
  userAgent: text('user_agent'),
  refreshTokenHash: text('refresh_token_hash'),
  createdAt: text('created_at').notNull()
}, (table) => ({
  userIdx: index('idx_sessions_user').on(table.userId)
}));

export const canvases = sqliteTable('canvases', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  content: text('content').notNull(),
  status: text('status').notNull().default('active'),
  schemaVersion: integer('schema_version').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
}, (table) => ({
  ownerIdx: index('idx_canvases_owner').on(table.ownerId)
}));

export const coverageAudit = sqliteTable(
  'coverage_audit',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    programId: integer('program_id').notNull(),
    runId: integer('run_id'),
    issues: text('issues').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (table) => ({
    programIdx: index('idx_coverage_audit_program').on(table.programId),
    runIdx: index('idx_coverage_audit_run').on(table.runId)
  })
);

export const coverageReports = sqliteTable(
  'coverage_reports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    day: text('day').notNull(),
    runId: integer('run_id'),
    withTags: integer('with_tags').notNull().default(0),
    withoutTags: integer('without_tags').notNull().default(0),
    withNaics: integer('with_naics').notNull().default(0),
    missingNaics: integer('missing_naics').notNull().default(0),
    validationIssues: text('validation_issues').notNull().default('[]'),
    createdAt: integer('created_at').notNull()
  },
  (table) => ({
    dayIdx: uniqueIndex('idx_coverage_reports_day').on(table.day)
  })
);

export const canvasVersions = sqliteTable('canvas_versions', {
  id: text('id').primaryKey(),
  canvasId: text('canvas_id').notNull(),
  revision: integer('revision').notNull(),
  content: text('content').notNull(),
  diff: text('diff'),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull()
}, (table) => ({
  canvasIdx: index('idx_canvas_versions_canvas').on(table.canvasId)
}));

export const emailTokens = sqliteTable('email_tokens', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  purpose: text('purpose').notNull(),
  userId: text('user_id'),
  accountRequestId: text('account_request_id'),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull()
}, (table) => ({
  accountIdx: index('idx_email_tokens_account').on(table.accountRequestId),
  userIdx: index('idx_email_tokens_user').on(table.userId)
}));

export const emailSuppressions = sqliteTable('email_suppressions', {
  email: text('email').primaryKey(),
  suppressed: integer('suppressed', { mode: 'boolean' }).notNull().default(false),
  lastEventType: text('last_event_type').notNull(),
  lastEventAt: text('last_event_at').notNull(),
  reason: text('reason'),
  description: text('description'),
  details: text('details'),
  messageStream: text('message_stream'),
  recordId: text('record_id'),
  metadata: text('metadata'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const emailSuppressionEvents = sqliteTable('email_suppression_events', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  eventType: text('event_type').notNull(),
  payload: text('payload').notNull(),
  recordedAt: text('recorded_at').notNull(),
  occurredAt: text('occurred_at'),
  messageStream: text('message_stream'),
  recordId: text('record_id')
}, (table) => ({
  emailIdx: index('idx_email_suppression_events_email').on(table.email)
}));
