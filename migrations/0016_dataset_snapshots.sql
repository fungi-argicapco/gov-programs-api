PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dataset_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  version TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dataset_snapshots_dataset
  ON dataset_snapshots (dataset_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS dataset_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  http_methods TEXT,
  parameters TEXT,
  authentication TEXT,
  rate_limit TEXT,
  cadence TEXT,
  change_detection TEXT,
  status_page TEXT,
  readiness TEXT,
  notes TEXT,
  source_url TEXT,
  verification_date TEXT,
  automation_metadata TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dataset_services_unique
  ON dataset_services (dataset_id, service_name);
