BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT,
  source_name TEXT,
  source_url TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  authority_level TEXT,
  state_code TEXT,
  industries TEXT NOT NULL DEFAULT '[]',
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  benefit_type TEXT,
  website_url TEXT,
  application_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS program_criteria (
  id TEXT PRIMARY KEY NOT NULL,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other',
  label TEXT NOT NULL,
  value TEXT,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_slug_unique ON tags (slug);

CREATE TABLE IF NOT EXISTS program_tags (
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (program_id, tag_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS programs_fts USING fts5(
  program_id UNINDEXED,
  title,
  summary,
  tags,
  criteria,
  tokenize='unicode61'
);

COMMIT;
