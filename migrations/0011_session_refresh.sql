ALTER TABLE sessions ADD COLUMN refresh_expires_at TEXT;
UPDATE sessions SET refresh_expires_at = created_at WHERE refresh_expires_at IS NULL;
