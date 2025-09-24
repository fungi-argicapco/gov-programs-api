import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

type ErrorPayload = {
  error: {
    code: string;
    message: string;
    details: unknown | null;
  };
};

export function apiError(
  c: Context,
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  const body: ErrorPayload = {
    error: {
      code,
      message,
      details: typeof details === 'undefined' ? null : details,
    },
  };
  const res = c.json(body, status as ContentfulStatusCode);
  res.headers.set('Content-Type', 'application/json; charset=utf-8');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
