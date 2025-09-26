const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function utcDateString(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
}

function runQuery(sql: string) {
  const result = Bun.spawnSync([
    'bunx',
    'wrangler',
    'd1',
    'execute',
    'DB',
    '--local',
    '--json',
    '--command',
    sql
  ]);
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString();
    if (stderr.includes('no such table')) {
      return [];
    }
    throw new Error(`wrangler d1 execute failed: ${stderr}`);
  }
  const text = result.stdout.toString();
  if (!text.trim()) return [];
  try {
    const parsed = JSON.parse(text);
    return parsed[0]?.results ?? [];
  } catch (error) {
    throw new Error(`Failed to parse query output: ${error}`);
  }
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function main() {
  const now = Date.now();
  const yesterday = new Date(now - DAY_MS);
  const yesterdayStr = utcDateString(yesterday);

  const sloRows = runQuery(
    `SELECT day_utc, route, requests, err_rate, p99_ms, slo_ok, budget_burn
     FROM slo_windows_daily
     WHERE day_utc = '${yesterdayStr}'
     ORDER BY route`
  ).map((row: any) => ({
    day_utc: String(row.day_utc ?? yesterdayStr),
    route: String(row.route ?? ''),
    requests: Number(row.requests ?? 0),
    err_rate: Number(row.err_rate ?? 0),
    p99_ms: Number(row.p99_ms ?? 0),
    slo_ok: Boolean(Number(row.slo_ok ?? 0)),
    budget_burn: normalizeNumber(row.budget_burn)
  }));

  const fromBucket = Math.floor((now - DAY_MS) / HOUR_MS) * HOUR_MS;
  const metricsRows = runQuery(
    `SELECT CAST(bucket_ts / ${HOUR_MS} AS INTEGER) * ${HOUR_MS} AS bucket_ts,
            route,
            status_class,
            SUM(count) AS count,
            CASE WHEN SUM(count) > 0 THEN SUM(p50_ms * count) / SUM(count) ELSE 0 END AS p50_ms,
            CASE WHEN SUM(count) > 0 THEN SUM(p95_ms * count) / SUM(count) ELSE 0 END AS p95_ms,
            CASE WHEN SUM(count) > 0 THEN SUM(p99_ms * count) / SUM(count) ELSE 0 END AS p99_ms,
            SUM(bytes_out) AS bytes_out
     FROM request_metrics_5m
     WHERE bucket_ts >= ${fromBucket}
     GROUP BY CAST(bucket_ts / ${HOUR_MS} AS INTEGER), route, status_class
     ORDER BY bucket_ts ASC, route ASC, status_class ASC`
  ).map((row: any) => ({
    bucket_ts: Number(row.bucket_ts ?? 0),
    route: String(row.route ?? ''),
    status_class: String(row.status_class ?? ''),
    count: Number(row.count ?? 0),
    p50_ms: Number(row.p50_ms ?? 0),
    p95_ms: Number(row.p95_ms ?? 0),
    p99_ms: Number(row.p99_ms ?? 0),
    bytes_out: Number(row.bytes_out ?? 0)
  }));

  const snapshot = {
    generated_at: new Date().toISOString(),
    slo: sloRows,
    metrics: metricsRows
  };

  await Bun.write('./ops-snapshot.json', JSON.stringify(snapshot, null, 2));
  console.log('SNAPSHOT=./ops-snapshot.json');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
