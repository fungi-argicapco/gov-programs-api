PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','error','partial')),
  fetched INTEGER DEFAULT 0,
  inserted INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0,
  unchanged INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  message TEXT,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS program_diffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_uid TEXT NOT NULL,
  source_id INTEGER,
  ts INTEGER NOT NULL,
  diff TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source_time ON ingestion_runs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_program_diffs_program_time ON program_diffs(program_uid, ts DESC);
