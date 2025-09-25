import type { Env } from './db';

export type RequestMetricInput = {
  route: string;
  status: number;
  dur_ms: number;
  bytes_out: number;
  ts: number;
};

export type MetricsReporter = {
  reportRequest: (metric: RequestMetricInput) => Promise<void>;
  flush: () => Promise<void>;
};

type MetricsEnv = Env & {
  CF_DO_METRICS_BINDING?: string;
  CF_DO_METRICS_CLASS?: string;
  [key: string]: unknown;
};

type AggregationKey = `${number}|${string}|${string}`;

type Aggregation = {
  bucket: number;
  route: string;
  statusClass: string;
  durations: number[];
  bytesOut: number;
};

const REPORTER_SYMBOL = Symbol.for('gov-programs.metrics.reporter');
const DEFAULT_THRESHOLD = 200;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function statusClass(code: number): '2xx' | '3xx' | '4xx' | '5xx' | 'other' {
  if (code >= 200 && code < 300) return '2xx';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  if (code >= 500 && code < 600) return '5xx';
  return 'other';
}

export function toBucket(ts: number): number {
  const bucket = Math.floor(ts / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
  return Number.isFinite(bucket) ? bucket : 0;
}

export function percentile(sortedDurations: number[], p: number): number {
  if (sortedDurations.length === 0) return 0;
  const clamped = Math.min(Math.max(p, 0), 1);
  const index = Math.ceil(clamped * sortedDurations.length) - 1;
  const safeIndex = Math.min(sortedDurations.length - 1, Math.max(0, index));
  return Math.round(sortedDurations[safeIndex]);
}

class MetricsBuffer {
  private readonly db: D1Database;
  private readonly threshold: number;
  private currentBucket: number | null = null;
  private totalCount = 0;
  private readonly buffer = new Map<AggregationKey, Aggregation>();
  private readonly accumulated = new Map<AggregationKey, { durations: number[]; bytesOut: number }>();

  constructor(db: D1Database, threshold = DEFAULT_THRESHOLD) {
    this.db = db;
    this.threshold = threshold;
  }

  public isBucketChange(bucket: number): boolean {
    return this.currentBucket !== null && this.currentBucket !== bucket;
  }

  public noteBucket(bucket: number) {
    if (this.currentBucket === null) {
      this.currentBucket = bucket;
    }
  }

  public add(metric: RequestMetricInput, bucket: number, status: string) {
    const key: AggregationKey = `${bucket}|${metric.route}|${status}`;
    let agg = this.buffer.get(key);
    if (!agg) {
      agg = {
        bucket,
        route: metric.route,
        statusClass: status,
        durations: [],
        bytesOut: 0
      };
      this.buffer.set(key, agg);
    }
    agg.durations.push(metric.dur_ms);
    agg.bytesOut += Math.max(0, Math.trunc(metric.bytes_out ?? 0));
    this.totalCount += 1;
  }

  public async flush(force: boolean) {
    if (this.totalCount === 0) {
      if (force) {
        this.accumulated.clear();
        this.currentBucket = null;
      }
      return;
    }
    if (!force && this.totalCount < this.threshold) {
      return;
    }

    const stmt = this.db.prepare(
      `INSERT INTO request_metrics_5m (
        bucket_ts, route, status_class, count, p50_ms, p95_ms, p99_ms, bytes_out
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bucket_ts, route, status_class) DO UPDATE SET
        count = excluded.count,
        p50_ms = excluded.p50_ms,
        p95_ms = excluded.p95_ms,
        p99_ms = excluded.p99_ms,
        bytes_out = excluded.bytes_out`
    );

    const statements: ReturnType<D1Database['prepare']>[] = [];
    for (const [key, agg] of this.buffer.entries()) {
      const batchDurations = agg.durations.slice().sort((a, b) => a - b);
      const existing = this.accumulated.get(key);
      const mergedDurations = existing
        ? mergeSorted(existing.durations, batchDurations)
        : batchDurations;
      const bytesOut = (existing?.bytesOut ?? 0) + Math.max(0, Math.trunc(agg.bytesOut));
      const count = mergedDurations.length;
      const p50 = percentile(mergedDurations, 0.5);
      const p95 = percentile(mergedDurations, 0.95);
      const p99 = percentile(mergedDurations, 0.99);

      statements.push(
        stmt.bind(agg.bucket, agg.route, agg.statusClass, count, p50, p95, p99, bytesOut)
      );

      this.accumulated.set(key, {
        durations: mergedDurations,
        bytesOut
      });
    }

    if (statements.length > 0) {
      await this.db.batch(statements);
    }

    this.buffer.clear();
    this.totalCount = 0;

    if (force) {
      this.accumulated.clear();
      this.currentBucket = null;
    }
  }
}

function mergeSorted(a: number[], b: number[]): number[] {
  if (a.length === 0) return b.slice();
  if (b.length === 0) return a.slice();
  const result = new Array<number>(a.length + b.length);
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < a.length && j < b.length) {
    if (a[i] <= b[j]) {
      result[k++] = a[i++];
    } else {
      result[k++] = b[j++];
    }
  }
  while (i < a.length) {
    result[k++] = a[i++];
  }
  while (j < b.length) {
    result[k++] = b[j++];
  }
  return result;
}

function hasDurableObjectNamespace(binding: unknown): binding is DurableObjectNamespace {
  return Boolean(binding) && typeof binding === 'object' && 'idFromName' in (binding as any);
}

export class MetricsDO {
  private readonly buffer: MetricsBuffer;

  constructor(_state: DurableObjectState, env: MetricsEnv) {
    this.buffer = new MetricsBuffer(env.DB);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/request') {
      const payload = (await request.json().catch(() => null)) as RequestMetricInput | null;
      if (!payload) {
        return new Response('invalid body', { status: 400 });
      }
      const bucket = toBucket(payload.ts);
      if (this.buffer.isBucketChange(bucket)) {
        await this.buffer.flush(true);
      }
      this.buffer.noteBucket(bucket);
      this.buffer.add(payload, bucket, statusClass(payload.status));
      await this.buffer.flush(false);
      return new Response('ok', { status: 202 });
    }
    if (request.method === 'POST' && url.pathname === '/flush') {
      await this.buffer.flush(true);
      return new Response('flushed', { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }
}

function createDurableReporter(env: MetricsEnv, namespace: DurableObjectNamespace): MetricsReporter {
  const id = namespace.idFromName('metrics');
  const stub = namespace.get(id);
  const base = 'https://metrics';
  return {
    async reportRequest(metric: RequestMetricInput) {
      await stub.fetch(`${base}/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(metric)
      });
    },
    async flush() {
      await stub.fetch(`${base}/flush`, { method: 'POST' });
    }
  };
}

function createFallbackReporter(env: MetricsEnv): MetricsReporter {
  const buffer = new MetricsBuffer(env.DB);
  return {
    async reportRequest(metric: RequestMetricInput) {
      const bucket = toBucket(metric.ts);
      if (buffer.isBucketChange(bucket)) {
        await buffer.flush(true);
      }
      buffer.noteBucket(bucket);
      buffer.add(metric, bucket, statusClass(metric.status));
      await buffer.flush(false);
    },
    async flush() {
      await buffer.flush(true);
    }
  };
}

export function getMetricsReporter(env: MetricsEnv): MetricsReporter {
  const cached = (env as any)[REPORTER_SYMBOL] as MetricsReporter | undefined;
  if (cached) {
    return cached;
  }
  const bindingName = env.CF_DO_METRICS_BINDING;
  if (bindingName) {
    const binding = (env as any)[bindingName];
    if (hasDurableObjectNamespace(binding)) {
      const reporter = createDurableReporter(env, binding);
      (env as any)[REPORTER_SYMBOL] = reporter;
      return reporter;
    }
  }
  const fallback = createFallbackReporter(env);
  (env as any)[REPORTER_SYMBOL] = fallback;
  return fallback;
}

