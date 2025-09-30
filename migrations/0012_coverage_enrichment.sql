PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS industry_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  naics_code TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  confidence REAL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_industry_mappings_code ON industry_mappings(naics_code);

CREATE TABLE IF NOT EXISTS coverage_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL,
  run_id INTEGER,
  issues TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES ingestion_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_coverage_audit_program ON coverage_audit(program_id);
CREATE INDEX IF NOT EXISTS idx_coverage_audit_run ON coverage_audit(run_id);

CREATE TABLE IF NOT EXISTS coverage_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  run_id INTEGER,
  with_tags INTEGER NOT NULL DEFAULT 0,
  without_tags INTEGER NOT NULL DEFAULT 0,
  with_naics INTEGER NOT NULL DEFAULT 0,
  missing_naics INTEGER NOT NULL DEFAULT 0,
  validation_issues TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES ingestion_runs(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coverage_reports_day ON coverage_reports(day);
