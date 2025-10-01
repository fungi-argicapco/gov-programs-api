import { schemaVersion, userProfileSchema } from '../schemas';
import type { Env } from '../db';
import {
  createEmailToken,
  createSession,
  deleteSession,
  getEmailToken,
  getSession,
  getSessionWithSecrets,
  markEmailTokenUsed,
  rotateSession,
} from '../onboarding/storage';
import { hashPassword, verifyPassword } from './password';
import { createTotpSecret, verifyTotpToken } from './totp';
import { mfaMethodSchema } from '../schemas';
import type { UserProfile } from '../schemas';

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return toHex(digest);
}

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  apps: string;
  roles: string;
  password_hash: string | null;
  mfa_enrolled: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type MfaMethodRow = {
  id: string;
  user_id: string;
  type: string;
  secret: string | null;
  verified_at: string | null;
  created_at: string;
};

type InternalMfaMethod = {
  id: string;
  type: 'totp' | 'webauthn';
  secret: string | null;
  verified_at: string | null;
};

type LoadedUser = {
  profile: UserProfile;
  passwordHash: string | null;
  methods: InternalMfaMethod[];
};

function normaliseApps(raw: string): { website: boolean; program: boolean; canvas: boolean } {
  const parsed = parseJson(raw, {} as Record<string, unknown>);
  return {
    website: Boolean(parsed.website),
    program: Boolean(parsed.program ?? true),
    canvas: Boolean(parsed.canvas ?? true),
  };
}

function normaliseRoles(raw: string): string[] {
  const parsed = parseJson(raw, [] as string[]);
  return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
}

function mapMethods(rows: MfaMethodRow[]): InternalMfaMethod[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type === 'totp' ? 'totp' : 'webauthn',
    secret: row.secret,
    verified_at: row.verified_at,
  }));
}

function buildProfile(row: UserRow, methods: InternalMfaMethod[]): UserProfile {
  const publicMethods = methods.map((method) =>
    mfaMethodSchema.parse({ id: method.id, type: method.type, verified_at: method.verified_at ?? null })
  );
  return userProfileSchema.parse({
    schema_version: schemaVersion.value,
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    status: row.status as UserProfile['status'],
    apps: normaliseApps(row.apps),
    roles: normaliseRoles(row.roles),
    mfa_enrolled: Boolean(row.mfa_enrolled),
    mfa_methods: publicMethods,
    last_login_at: row.last_login_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

async function loadUserByEmail(env: Env, email: string): Promise<LoadedUser | null> {
  const row = await env.DB.prepare(`SELECT * FROM users WHERE email = ?1`).bind(email.toLowerCase()).first<UserRow>();
  if (!row) return null;
  const methods = await env.DB.prepare(`SELECT * FROM mfa_methods WHERE user_id = ?1`).bind(row.id).all<MfaMethodRow>();
  const mapped = mapMethods(methods.results ?? []);
  return {
    profile: buildProfile(row, mapped),
    passwordHash: row.password_hash,
    methods: mapped,
  };
}

async function loadUserById(env: Env, id: string): Promise<LoadedUser | null> {
  const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ?1`).bind(id).first<UserRow>();
  if (!row) return null;
  const methods = await env.DB.prepare(`SELECT * FROM mfa_methods WHERE user_id = ?1`).bind(row.id).all<MfaMethodRow>();
  const mapped = mapMethods(methods.results ?? []);
  return {
    profile: buildProfile(row, mapped),
    passwordHash: row.password_hash,
    methods: mapped,
  };
}

async function updateUserPassword(env: Env, userId: string, passwordHash: string): Promise<void> {
  const ts = new Date().toISOString();
  await env.DB.prepare(`UPDATE users SET password_hash = ?1, status = 'active', updated_at = ?2 WHERE id = ?3`)
    .bind(passwordHash, ts, userId)
    .run();
}

async function setUserMfaEnrollment(env: Env, userId: string, enrolled: boolean): Promise<void> {
  await env.DB.prepare(`UPDATE users SET mfa_enrolled = ?1, updated_at = ?2 WHERE id = ?3`)
    .bind(enrolled ? 1 : 0, new Date().toISOString(), userId)
    .run();
}

async function recordLogin(env: Env, userId: string): Promise<void> {
  const ts = new Date().toISOString();
  await env.DB.prepare(`UPDATE users SET last_login_at = ?1, updated_at = ?1 WHERE id = ?2`).bind(ts, userId).run();
}

type IssueSessionOptions = { mfaRequired: boolean; ip?: string; userAgent?: string };

type SessionData = Awaited<ReturnType<typeof createSession>>;

type IssuedSession = {
  session: SessionData;
  refreshToken: string;
  refreshExpiresAt: string;
};

async function issueSession(env: Env, userId: string, options: IssueSessionOptions): Promise<IssuedSession> {
  const refreshToken = randomToken();
  const refreshHash = await hashToken(refreshToken);
  const refreshExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  const session = await createSession(env, userId, {
    mfaRequired: options.mfaRequired,
    ip: options.ip,
    userAgent: options.userAgent,
    refreshTokenHash: refreshHash,
    refreshExpiresAt,
  });
  return { session, refreshToken, refreshExpiresAt };
}

function isStrongPassword(password: string): boolean {
  if (password.length < 12) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

export type AuthSuccess = {
  status: 'ok';
  user: UserProfile;
  session: SessionData;
  refresh_token: string;
  refresh_expires_at: string;
};

export type MfaChallenge = {
  status: 'mfa-required';
  challenge_id: string;
  expires_at: string;
  methods: Array<'totp' | 'webauthn'>;
};

export type LoginResult = AuthSuccess | MfaChallenge;

export async function acceptInvite(
  env: Env,
  params: { token: string; password: string; ip?: string; userAgent?: string }
): Promise<AuthSuccess> {
  if (!isStrongPassword(params.password)) {
    throw new Error('weak_password');
  }
  const record = await getEmailToken(env, params.token, 'signup');
  if (!record || !record.user_id) {
    throw new Error('invalid_token');
  }
  const user = await loadUserById(env, record.user_id);
  if (!user) {
    throw new Error('user_not_found');
  }
  const passwordHash = await hashPassword(params.password);
  await updateUserPassword(env, record.user_id, passwordHash);
  await markEmailTokenUsed(env, record.id);
  const issued = await issueSession(env, record.user_id, { mfaRequired: false, ip: params.ip, userAgent: params.userAgent });
  await recordLogin(env, record.user_id);
  const refreshedUser = await loadUserById(env, record.user_id);
  if (!refreshedUser) {
    throw new Error('user_not_found');
  }
  return {
    status: 'ok',
    user: refreshedUser.profile,
    session: issued.session,
    refresh_token: issued.refreshToken,
    refresh_expires_at: issued.refreshExpiresAt,
  };
}

function hasVerifiedTotp(methods: InternalMfaMethod[]): InternalMfaMethod | null {
  return methods.find((method) => method.type === 'totp' && Boolean(method.verified_at) && method.secret) ?? null;
}

export async function login(
  env: Env,
  params: { email: string; password: string; totpCode?: string; ip?: string; userAgent?: string }
): Promise<LoginResult> {
  const user = await loadUserByEmail(env, params.email);
  if (!user || !user.passwordHash) {
    throw new Error('invalid_credentials');
  }
  const passwordOk = await verifyPassword(params.password, user.passwordHash);
  if (!passwordOk) {
    throw new Error('invalid_credentials');
  }
  if (user.profile.status !== 'active') {
    throw new Error('inactive_user');
  }
  const verifiedTotp = hasVerifiedTotp(user.methods);
  if (verifiedTotp && user.profile.mfa_enrolled) {
    if (!params.totpCode) {
      const expiresAt = new Date(Date.now() + 1000 * 60 * 5).toISOString();
      const challenge = await createEmailToken(env, {
        purpose: 'mfa-challenge',
        userId: user.profile.id,
        expiresAt,
      });
      return {
        status: 'mfa-required',
        challenge_id: challenge.token,
        expires_at: challenge.expiresAt,
        methods: ['totp'],
      };
    }
    if (!verifyTotpToken(verifiedTotp.secret, params.totpCode)) {
      throw new Error('invalid_mfa');
    }
  }
  const issued = await issueSession(env, user.profile.id, {
    mfaRequired: Boolean(verifiedTotp && user.profile.mfa_enrolled && !params.totpCode),
    ip: params.ip,
    userAgent: params.userAgent,
  });
  await recordLogin(env, user.profile.id);
  const refreshed = await loadUserById(env, user.profile.id);
  if (!refreshed) {
    throw new Error('user_not_found');
  }
  return {
    status: 'ok',
    user: refreshed.profile,
    session: issued.session,
    refresh_token: issued.refreshToken,
    refresh_expires_at: issued.refreshExpiresAt,
  };
}

export async function verifyMfaChallenge(
  env: Env,
  params: { challengeId: string; code: string; ip?: string; userAgent?: string }
): Promise<AuthSuccess> {
  const token = await getEmailToken(env, params.challengeId, 'mfa-challenge');
  if (!token || !token.user_id) {
    throw new Error('invalid_challenge');
  }
  const user = await loadUserById(env, token.user_id);
  if (!user) {
    throw new Error('user_not_found');
  }
  const totp = hasVerifiedTotp(user.methods);
  if (!totp || !totp.secret) {
    throw new Error('mfa_not_configured');
  }
  if (!verifyTotpToken(totp.secret, params.code)) {
    throw new Error('invalid_mfa');
  }
  await markEmailTokenUsed(env, token.id);
  const issued = await issueSession(env, user.profile.id, { mfaRequired: false, ip: params.ip, userAgent: params.userAgent });
  await recordLogin(env, user.profile.id);
  const refreshed = await loadUserById(env, user.profile.id);
  if (!refreshed) {
    throw new Error('user_not_found');
  }
  return {
    status: 'ok',
    user: refreshed.profile,
    session: issued.session,
    refresh_token: issued.refreshToken,
    refresh_expires_at: issued.refreshExpiresAt,
  };
}

export async function startTotpEnrollment(env: Env, userId: string) {
  const user = await loadUserById(env, userId);
  if (!user) {
    throw new Error('user_not_found');
  }
  await env.DB.prepare(`DELETE FROM mfa_methods WHERE user_id = ?1 AND type = 'totp' AND verified_at IS NULL`).bind(userId).run();
  const secret = createTotpSecret(user.profile.email);
  const methodId = `mfa_${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO mfa_methods (id, user_id, type, secret, verified_at, created_at) VALUES (?1, ?2, 'totp', ?3, NULL, ?4)`
  )
    .bind(methodId, userId, secret.secret, createdAt)
    .run();
  await setUserMfaEnrollment(env, userId, false);
  return { method_id: methodId, secret: secret.secret, otpauth_url: secret.uri };
}

export async function confirmTotpEnrollment(env: Env, params: { userId: string; methodId: string; code: string }) {
  const method = await env.DB.prepare(`SELECT * FROM mfa_methods WHERE id = ?1 AND user_id = ?2`)
    .bind(params.methodId, params.userId)
    .first<MfaMethodRow>();
  if (!method || method.type !== 'totp' || !method.secret) {
    throw new Error('invalid_method');
  }
  if (!verifyTotpToken(method.secret, params.code)) {
    throw new Error('invalid_mfa');
  }
  const nowIso = new Date().toISOString();
  await env.DB.prepare(`UPDATE mfa_methods SET verified_at = ?1 WHERE id = ?2`).bind(nowIso, method.id).run();
  await setUserMfaEnrollment(env, params.userId, true);
  const user = await loadUserById(env, params.userId);
  if (!user) {
    throw new Error('user_not_found');
  }
  return user.profile;
}

export async function refreshSession(
  env: Env,
  params: { sessionId: string; refreshToken: string; ip?: string; userAgent?: string }
): Promise<AuthSuccess> {
  const stored = await getSessionWithSecrets(env, params.sessionId);
  if (!stored || !stored.refreshTokenHash) {
    throw new Error('invalid_session');
  }
  const session = stored.session;
  if (!session.refresh_expires_at) {
    throw new Error('invalid_session');
  }
  const expiresAtTs = Date.parse(session.refresh_expires_at);
  if (expiresAtTs < Date.now()) {
    await deleteSession(env, session.id);
    throw new Error('expired_refresh');
  }
  const providedHash = await hashToken(params.refreshToken);
  if (providedHash !== stored.refreshTokenHash) {
    await deleteSession(env, session.id);
    throw new Error('invalid_refresh');
  }
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();
  const refreshToken = randomToken();
  const refreshExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  const refreshHash = await hashToken(refreshToken);
  await rotateSession(env, session.id, {
    issuedAt,
    expiresAt,
    refreshTokenHash: refreshHash,
    refreshExpiresAt,
    ip: params.ip,
    userAgent: params.userAgent,
  });
  const latest = await getSession(env, session.id);
  if (!latest) {
    throw new Error('invalid_session');
  }
  const user = await loadUserById(env, latest.user_id);
  if (!user) {
    throw new Error('user_not_found');
  }
  return {
    status: 'ok',
    user: user.profile,
    session: { ...latest, mfa_required: latest.mfa_required },
    refresh_token: refreshToken,
    refresh_expires_at: refreshExpiresAt,
  };
}
