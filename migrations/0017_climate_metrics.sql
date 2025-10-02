PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS climate_country_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  indicator TEXT NOT NULL,
  country_iso3 TEXT NOT NULL,
  year INTEGER,
  value REAL,
  unit TEXT,
  metadata TEXT,
  version TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_climate_country_metrics_country
  ON climate_country_metrics (country_iso3, indicator, year);

CREATE TABLE IF NOT EXISTS climate_subnational_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  indicator TEXT NOT NULL,
  country_iso3 TEXT NOT NULL,
  admin_level TEXT NOT NULL,
  admin_code TEXT NOT NULL,
  iso_code TEXT,
  year INTEGER,
  value REAL,
  unit TEXT,
  metadata TEXT,
  version TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_climate_subnational_metrics_admin
  ON climate_subnational_metrics (admin_code, indicator, year);
