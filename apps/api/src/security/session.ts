import type { Env } from '../db';

const DEFAULT_COOKIE_NAME = 'fungi_session';
const REFRESH_SUFFIX = '_rt';

export function getSessionCookieName(env: Env): string {
  return env.SESSION_COOKIE_NAME ?? DEFAULT_COOKIE_NAME;
}

export function getRefreshCookieName(env: Env): string {
  return `${getSessionCookieName(env)}${REFRESH_SUFFIX}`;
}

export function setSessionCookie(env: Env, response: Response, sessionId: string, expiresAt: string): void {
  const name = getSessionCookieName(env);
  const expires = new Date(expiresAt).toUTCString();
  response.headers.append('Set-Cookie', `${name}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`);
}

export function clearSessionCookie(env: Env, response: Response): void {
  const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
  response.headers.append('Set-Cookie', `${getSessionCookieName(env)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`);
  response.headers.append('Set-Cookie', `${getRefreshCookieName(env)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`);
}

export function readSessionCookie(env: Env, request: Request): string | null {
  return readCookie(getSessionCookieName(env), request);
}

export function setRefreshCookie(env: Env, response: Response, token: string, expiresAt: string): void {
  const expires = new Date(expiresAt).toUTCString();
  response.headers.append('Set-Cookie', `${getRefreshCookieName(env)}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`);
}

export function readRefreshCookie(env: Env, request: Request): string | null {
  return readCookie(getRefreshCookieName(env), request);
}

function readCookie(name: string, request: Request): string | null {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const parts = cookie.split(/;\s*/);
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === name && value) {
      return value;
    }
  }
  return null;
}
