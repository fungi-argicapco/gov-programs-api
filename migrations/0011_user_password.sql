ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN last_password_change TEXT;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
