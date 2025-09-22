-- FTS5 index on programs.title/summary with external content
CREATE VIRTUAL TABLE IF NOT EXISTS programs_fts USING fts5(
  title, summary, content='programs', content_rowid='id', tokenize='unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS programs_ai AFTER INSERT ON programs BEGIN
  INSERT INTO programs_fts(rowid, title, summary) VALUES (new.id, new.title, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS programs_ad AFTER DELETE ON programs BEGIN
  DELETE FROM programs_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS programs_au AFTER UPDATE ON programs BEGIN
  INSERT INTO programs_fts(programs_fts, rowid, title, summary) VALUES('delete', old.id, old.title, old.summary);
  INSERT INTO programs_fts(rowid, title, summary) VALUES (new.id, new.title, new.summary);
END;
