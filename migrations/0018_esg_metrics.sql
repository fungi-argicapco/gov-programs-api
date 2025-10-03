PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS esg_indicator_metadata (
  indicator_code TEXT PRIMARY KEY,
  indicator_name TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  source TEXT,
  methodology TEXT,
  coverage TEXT,
  notes TEXT,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS esg_country_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  indicator_code TEXT NOT NULL,
  country_iso3 TEXT NOT NULL,
  year INTEGER NOT NULL,
  value REAL,
  unit TEXT,
  source TEXT NOT NULL,
  version TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (indicator_code) REFERENCES esg_indicator_metadata(indicator_code)
);

CREATE INDEX IF NOT EXISTS idx_esg_country_metrics_indicator
  ON esg_country_metrics (indicator_code, country_iso3, year);
