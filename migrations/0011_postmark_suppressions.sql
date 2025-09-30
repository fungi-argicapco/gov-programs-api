CREATE TABLE IF NOT EXISTS email_suppressions (
  email TEXT PRIMARY KEY,
  suppressed INTEGER NOT NULL DEFAULT 0,
  last_event_type TEXT NOT NULL,
  last_event_at TEXT NOT NULL,
  reason TEXT,
  description TEXT,
  details TEXT,
  message_stream TEXT,
  record_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_suppression_events (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  occurred_at TEXT,
  message_stream TEXT,
  record_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_suppression_events_email
  ON email_suppression_events(email);
