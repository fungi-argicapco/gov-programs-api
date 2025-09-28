import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

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
