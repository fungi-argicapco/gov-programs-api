PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL CHECK (length(country_code)=2),
  authority_level TEXT NOT NULL CHECK (authority_level IN ('federal','state','prov','territory','regional','municipal')),
  jurisdiction_code TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  benefit_type TEXT CHECK (benefit_type IN ('grant','rebate','tax_credit','loan','guarantee','voucher','other')),
  status TEXT NOT NULL CHECK (status IN ('open','scheduled','closed','unknown')),
  industry_codes TEXT,                -- JSON array
  start_date TEXT,                    -- YYYY-MM-DD
  end_date TEXT,
  url TEXT,
  source_id INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

CREATE TABLE IF NOT EXISTS benefits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  min_amount_cents INTEGER,
  max_amount_cents INTEGER,
  currency_code TEXT,
  notes TEXT,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  operator TEXT NOT NULL,
  value TEXT NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT,
  license TEXT,
  tos_url TEXT,
  authority_level TEXT NOT NULL,
  jurisdiction_code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER,
  raw_key TEXT NOT NULL,
  raw_hash TEXT,
  fetched_at INTEGER NOT NULL,
  adapter TEXT NOT NULL,
  source_url TEXT,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_programs_uid ON programs(uid);
CREATE INDEX IF NOT EXISTS idx_programs_country ON programs(country_code);
CREATE INDEX IF NOT EXISTS idx_programs_jurisdiction ON programs(jurisdiction_code);
CREATE INDEX IF NOT EXISTS idx_programs_status ON programs(status);
CREATE INDEX IF NOT EXISTS idx_benefits_program ON benefits(program_id);
CREATE INDEX IF NOT EXISTS idx_criteria_program ON criteria(program_id);
CREATE INDEX IF NOT EXISTS idx_tags_program ON tags(program_id);
