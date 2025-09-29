import type { Env } from '../db';

const DEFAULT_COOKIE_NAME = 'fungi_session';

export function getSessionCookieName(env: Env): string {
  return env.SESSION_COOKIE_NAME ?? DEFAULT_COOKIE_NAME;
}

export function setSessionCookie(env: Env, response: Response, sessionId: string, expiresAt: string): void {
  const name = getSessionCookieName(env);
  const expires = new Date(expiresAt).toUTCString();
  response.headers.append('Set-Cookie', `${name}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`);
}

export function clearSessionCookie(env: Env, response: Response): void {
  const name = getSessionCookieName(env);
  response.headers.append('Set-Cookie', `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

export function readSessionCookie(env: Env, request: Request): string | null {
  const name = getSessionCookieName(env);
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
