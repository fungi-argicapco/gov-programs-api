PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS raid_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  admin_unit_code TEXT NOT NULL,
  admin_unit_level TEXT,
  risk_description TEXT NOT NULL,
  assumption TEXT,
  issue TEXT,
  dependency TEXT,
  severity TEXT,
  impact TEXT,
  mitigation TEXT,
  notes TEXT,
  source_url TEXT,
  verification_date TEXT,
  automation_metadata TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raid_logs_unit
  ON raid_logs (admin_unit_code);
