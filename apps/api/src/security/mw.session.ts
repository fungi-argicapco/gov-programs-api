import type { MiddlewareHandler, Context } from 'hono';
import { apiError } from '../errors';
import type { Env } from '../db';
import type { SessionPayload, UserProfile } from '../schemas';
import { getSession, deleteSession, getUserProfileById } from '../onboarding/storage';
import { readSessionCookie, getSessionCookieName, getRefreshCookieName } from './session';

export type SessionVariables = {
  session?: SessionPayload;
  user?: UserProfile;
};

function isExpired(iso: string): boolean {
  const ts = Date.parse(iso);
  return Number.isNaN(ts) || ts <= Date.now();
}

function safeAppendCookie(c: Context<{ Bindings: Env; Variables: SessionVariables }>, name: string, value: string) {
  try {
    c.header(name, value, { append: true });
  } catch (error) {
    console.warn('Failed to append cookie header', { name, error: error instanceof Error ? error.message : String(error) });
  }
}

export const mwSession: MiddlewareHandler<{ Bindings: Env; Variables: SessionVariables }> = async (c, next) => {
  const sessionId = readSessionCookie(c.env, c.req.raw);
  if (!sessionId) {
    await next();
    return;
  }

  const session = await getSession(c.env, sessionId);
  if (!session || isExpired(session.expires_at)) {
    if (session?.id) {
      await deleteSession(c.env, session.id).catch(() => undefined);
    }
    const pathname = new URL(c.req.url).pathname;
    if (!pathname.startsWith('/assets/') && pathname !== '/favicon.ico' && !pathname.startsWith('/cdn-cgi/')) {
      const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
      safeAppendCookie(c, 'Set-Cookie', `${getSessionCookieName(c.env)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`);
      safeAppendCookie(c, 'Set-Cookie', `${getRefreshCookieName(c.env)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`);
    }
    await next();
    return;
  }

  const profile = await getUserProfileById(c.env, session.user_id);
  if (!profile) {
    await deleteSession(c.env, session.id).catch(() => undefined);
    const pathname = new URL(c.req.url).pathname;
    if (!pathname.startsWith('/assets/') && pathname !== '/favicon.ico' && !pathname.startsWith('/cdn-cgi/')) {
      const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
      safeAppendCookie(c, 'Set-Cookie', `${getSessionCookieName(c.env)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`);
      safeAppendCookie(c, 'Set-Cookie', `${getRefreshCookieName(c.env)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`);
    }
    await next();
    return;
  }

  c.set('session', session);
  c.set('user', profile);

  await next();
};

export const requireSession: MiddlewareHandler<{ Bindings: Env; Variables: SessionVariables }> = async (c, next) => {
  const session = c.get('session');
  const user = c.get('user');
  if (!session || !user) {
    return apiError(c, 401, 'unauthorized', 'Session required.');
  }
  return next();
};

export const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: SessionVariables }> = async (c, next) => {
  const session = c.get('session');
  const user = c.get('user');
  if (!session || !user) {
    return apiError(c, 401, 'unauthorized', 'Session required.');
  }
  const roles = Array.isArray(user.roles) ? user.roles : [];
  if (!roles.includes('admin')) {
    return apiError(c, 403, 'forbidden', 'Admin privileges required.');
  }
  return next();
};
