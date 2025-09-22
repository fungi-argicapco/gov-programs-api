CREATE TABLE IF NOT EXISTS applicant_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id INTEGER,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  jurisdiction_code TEXT,
  naics TEXT,
  headcount INTEGER,
  capex_cents INTEGER,
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS saved_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  query_json TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  saved_query_id INTEGER NOT NULL,
  sink TEXT NOT NULL,
  target TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (saved_query_id) REFERENCES saved_queries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alert_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  queued_at INTEGER NOT NULL,
  delivered_at INTEGER,
  attempts INTEGER DEFAULT 0,
  status TEXT CHECK(status IN ('queued','ok','error')) DEFAULT 'queued'
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON alert_outbox(status, queued_at);
