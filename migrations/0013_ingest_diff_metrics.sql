PRAGMA foreign_keys = ON;

ALTER TABLE ingestion_runs ADD COLUMN critical INTEGER DEFAULT 0;
ALTER TABLE ingestion_runs ADD COLUMN notes TEXT;

ALTER TABLE program_diffs ADD COLUMN run_id INTEGER;
ALTER TABLE program_diffs ADD COLUMN summary TEXT;
ALTER TABLE program_diffs ADD COLUMN critical INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_program_diffs_run ON program_diffs(run_id);

CREATE TABLE IF NOT EXISTS snapshot_diffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_uid TEXT NOT NULL,
  snapshot_id INTEGER NOT NULL,
  prev_snapshot_id INTEGER,
  run_id INTEGER,
  source_id INTEGER,
  ts INTEGER NOT NULL,
  diff TEXT NOT NULL,
  critical INTEGER DEFAULT 0,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (prev_snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL,
  FOREIGN KEY (run_id) REFERENCES ingestion_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshot_diffs_program_time ON snapshot_diffs(program_uid, ts DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_diffs_run ON snapshot_diffs(run_id);
