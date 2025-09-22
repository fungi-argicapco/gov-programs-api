CREATE TABLE IF NOT EXISTS daily_coverage_stats (
  day TEXT PRIMARY KEY,
  country_code TEXT,
  jurisdiction_code TEXT,
  n_programs INTEGER,
  fresh_sources INTEGER,
  naics_density REAL,
  deadlink_rate REAL,
  created_at INTEGER
);
