CREATE TABLE IF NOT EXISTS request_metrics_5m (
  bucket_ts INTEGER NOT NULL,
  route TEXT NOT NULL,
  status_class TEXT NOT NULL,
  count INTEGER NOT NULL,
  p50_ms INTEGER NOT NULL,
  p95_ms INTEGER NOT NULL,
  p99_ms INTEGER NOT NULL,
  bytes_out INTEGER NOT NULL,
  PRIMARY KEY(bucket_ts, route, status_class)
);
