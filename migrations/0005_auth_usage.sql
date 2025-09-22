CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('admin','partner','read')),
  name TEXT,
  quota_daily INTEGER,
  quota_monthly INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  last_seen_at INTEGER
);

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  route TEXT NOT NULL,
  cost INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_usage_key_ts ON usage_events(api_key_id, ts DESC);
