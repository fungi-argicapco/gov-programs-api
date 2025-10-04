import type { MiddlewareHandler } from 'hono';
import type { Env } from './db';
import type { AuthVariables } from './mw.auth';
import { getMetricsReporter } from './do.metrics';

type MetricsBindings = Env & {
  METRICS_DISABLE?: string;
  CF_DO_METRICS_BINDING?: string;
  CF_DO_METRICS_CLASS?: string;
};

const MAX_SAMPLE_BYTES = 64 * 1024;

function isMetricsDisabled(env: MetricsBindings): boolean {
  const flag = env.METRICS_DISABLE;
  return flag === '1' || flag === 'true';
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function estimateBytesOut(res: Response): Promise<number | null> {
  try {
    const headerLength = parseContentLength(res.headers.get('content-length'));
    if (headerLength !== null) {
      return headerLength;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('text/') && !contentType.startsWith('application/json')) {
      return null;
    }
    const clone = res.clone();
    if (!clone.body) {
      return 0;
    }
    const reader = clone.body.getReader();
    let total = 0;
    while (total <= MAX_SAMPLE_BYTES) {
      const { done, value } = await reader.read();
      if (done) {
        return total;
      }
      total += value?.byteLength ?? 0;
      if (total > MAX_SAMPLE_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export const mwMetrics: MiddlewareHandler<{ Bindings: MetricsBindings; Variables: AuthVariables }> = async (c, next) => {
  if (isMetricsDisabled(c.env)) {
    await next();
    return;
  }

  const start = Date.now();
  const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
  try {
    c.req.raw.headers.set('x-request-id', requestId);
  } catch {
    // ignored: Request headers can be immutable in some runtimes
  }

  await next();

  const response = c.res;
  if (!response || typeof (response as Response).headers?.set !== 'function') {
    return;
  }

  response.headers.set('x-request-id', requestId);

  const durationMs = Math.max(0, Date.now() - start);
  const bytesOut = (await estimateBytesOut(response as Response)) ?? 0;
  const reporter = getMetricsReporter(c.env as MetricsBindings);
  const metricTs = Date.now();

  try {
    await reporter.reportRequest({
      route: c.req.path,
      status: response.status,
      dur_ms: durationMs,
      bytes_out: Math.max(0, Math.trunc(bytesOut)),
      ts: metricTs
    });
  } catch (error) {
    console.warn('metrics.reportRequest failed', error);
  }
};
