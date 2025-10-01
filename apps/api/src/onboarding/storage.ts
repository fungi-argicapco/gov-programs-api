import {
  canvasCreateSchema,
  canvasSchema,
  canvasUpdateSchema,
  canvasVersionSchema,
  exampleCanvasContent,
  schemaVersion,
} from '../schemas';
import type { Env } from '../db';

type DateTimeString = string;

const SCHEMA_VERSION = schemaVersion.value;

function now(): DateTimeString {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

type AccountRequestRecord = {
  id: string;
  email: string;
  display_name: string;
  requested_apps: string;
  justification: string | null;
  status: string;
  schema_version: number;
  created_at: string;
  decided_at: string | null;
  reviewer_id: string | null;
  reviewer_comment: string | null;
};

export type EmailTokenRecord = {
  id: string;
  token: string;
  purpose: string;
  user_id: string | null;
  account_request_id: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

type UserRecord = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  apps: string;
  roles: string;
  mfa_enrolled: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type CanvasRecord = {
  id: string;
  owner_id: string;
  title: string;
  summary: string | null;
  content: string;
  status: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
};

type CanvasVersionRecord = {
  id: string;
  canvas_id: string;
  revision: number;
  content: string;
  diff: string | null;
  created_at: string;
  created_by: string;
};

type SessionRecord = {
  id: string;
  user_id: string;
  issued_at: string;
  expires_at: string;
  refresh_expires_at?: string | null;
  mfa_required: number;
  ip: string | null;
  user_agent: string | null;
  refresh_token_hash: string | null;
  created_at: string;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}


async function insertEmailToken(env: Env, options: {
  purpose: string;
  accountRequestId?: string;
  userId?: string;
  expiresAt?: string;
}) {
  const id = randomId('tok');
  const token = randomId(options.purpose.replace(/[^a-z0-9]/gi, '') || 'token');
  const createdAt = now();
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  await env.DB.prepare(
    `INSERT INTO email_tokens (id, token, purpose, user_id, account_request_id, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  ).bind(
    id,
    token,
    options.purpose,
    options.userId ?? null,
    options.accountRequestId ?? null,
    expiresAt,
    createdAt
  ).run();
  return { id, token, expiresAt, createdAt };
}

export async function createEmailToken(
  env: Env,
  options: { purpose: string; accountRequestId?: string; userId?: string; expiresAt?: string }
) {
  return insertEmailToken(env, options);
}

export async function createAccountRequest(
  env: Env,
  payload: { email: string; displayName: string; requestedApps: Record<string, boolean>; justification?: string }
) {
  const id = randomId('acct');
  const tokenId = randomId('tok');
  const decisionToken = randomId('decision');
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  await env.DB.prepare(
    `INSERT INTO account_requests (id, email, display_name, requested_apps, justification, status, schema_version, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7)`
  ).bind(
    id,
    payload.email,
    payload.displayName,
    JSON.stringify(payload.requestedApps),
    payload.justification ?? null,
    SCHEMA_VERSION,
    createdAt
  ).run();

  const tokenInfo = await insertEmailToken(env, {
    purpose: 'account-decision',
    accountRequestId: id,
    expiresAt
  });

  return {
    accountRequest: {
      schema_version: SCHEMA_VERSION,
      id,
      email: payload.email,
      display_name: payload.displayName,
      requested_apps: payload.requestedApps,
      justification: payload.justification,
      status: 'pending' as const,
      created_at: createdAt
    },
    decisionToken: tokenInfo.token,
    tokenId: tokenInfo.id,
    tokenExpiresAt: tokenInfo.expiresAt
  };
}

export async function getAccountRequestByToken(env: Env, token: string) {
  const record = await env.DB.prepare(
    `SELECT ar.*, et.id AS token_id, et.purpose AS token_purpose, et.expires_at AS token_expires_at,
            et.used_at AS token_used_at, et.created_at AS token_created_at
     FROM email_tokens et
     INNER JOIN account_requests ar ON ar.id = et.account_request_id
     WHERE et.token = ?1`
  ).bind(token).first<AccountRequestRecord & {
    token_id: string;
    token_purpose: string;
    token_expires_at: string;
    token_used_at: string | null;
    token_created_at: string;
  }>();

  if (!record) return null;

  return {
    accountRequest: {
      schema_version: record.schema_version as typeof SCHEMA_VERSION,
      id: record.id,
      email: record.email,
      display_name: record.display_name,
      requested_apps: parseJson(record.requested_apps, {} as Record<string, boolean>),
      justification: record.justification ?? undefined,
      status: record.status,
      created_at: record.created_at,
      decided_at: record.decided_at ?? undefined
    },
    token: {
      value: token,
      id: record.token_id,
      purpose: record.token_purpose,
      expires_at: record.token_expires_at,
      used_at: record.token_used_at,
      created_at: record.token_created_at
    }
  };
}

export async function markDecisionTokenUsed(env: Env, tokenId: string): Promise<void> {
  await env.DB.prepare(`UPDATE email_tokens SET used_at = ?1 WHERE id = ?2`).bind(now(), tokenId).run();
}

export async function updateAccountRequestStatus(
  env: Env,
  id: string,
  status: 'approved' | 'declined',
  reviewerId: string | null,
  reviewerComment?: string
) {
  const decidedAt = now();
  const record = await env.DB.prepare(
    `UPDATE account_requests
     SET status = ?1, decided_at = ?2, reviewer_id = ?3, reviewer_comment = ?4
     WHERE id = ?5
     RETURNING *`
  )
    .bind(status, decidedAt, reviewerId, reviewerComment ?? null, id)
    .first<AccountRequestRecord>();

  if (!record) {
    return null;
  }

  return {
    schema_version: record.schema_version as typeof SCHEMA_VERSION,
    id: record.id,
    email: record.email,
    display_name: record.display_name,
    requested_apps: parseJson(record.requested_apps, {} as Record<string, boolean>),
    justification: record.justification ?? undefined,
    status: record.status,
    created_at: record.created_at,
    decided_at: record.decided_at ?? undefined
  };
}

export async function ensureUserWithDefaultCanvas(env: Env, profile: {
  id?: string;
  email: string;
  display_name: string;
  status: 'pending' | 'active' | 'disabled';
  apps: Record<string, boolean>;
  roles: string[];
  mfa_enrolled: boolean;
}) {
  const existing = await env.DB.prepare(`SELECT * FROM users WHERE email = ?1`).bind(profile.email.toLowerCase()).first<UserRecord>();
  const createdAt = now();
  const userId = existing?.id ?? profile.id ?? randomId('user');

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO users (id, email, display_name, status, apps, roles, mfa_enrolled, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`
    ).bind(
      userId,
      profile.email.toLowerCase(),
      profile.display_name,
      profile.status,
      JSON.stringify(profile.apps),
      JSON.stringify(profile.roles ?? []),
      profile.mfa_enrolled ? 1 : 0,
      createdAt
    ).run();

    const canvasId = randomId('canvas');
    const payload = JSON.stringify(exampleCanvasContent);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO canvases (id, owner_id, title, summary, content, status, schema_version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?7, ?7)`
      ).bind(
        canvasId,
        userId,
        'Lean Canvas Quickstart',
        'An example canvas highlighting fungiagricap best practices.',
        payload,
        SCHEMA_VERSION,
        createdAt
      ),
      env.DB.prepare(
        `INSERT INTO canvas_versions (id, canvas_id, revision, content, created_at, created_by)
         VALUES (?1, ?2, 1, ?3, ?4, ?5)`
      ).bind(randomId('cver'), canvasId, payload, createdAt, userId)
    ]);
  }

  return userId;
}

export async function createSession(
  env: Env,
  userId: string,
  options: {
    mfaRequired: boolean;
    ip?: string;
    userAgent?: string;
    refreshTokenHash?: string;
    refreshExpiresAt?: string;
    issuedAt?: string;
    expiresAt?: string;
  }
) {
  const id = randomId('sess');
  const issuedAt = options.issuedAt ?? now();
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();
  const refreshExpiresAt = options.refreshTokenHash
    ? options.refreshExpiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
    : null;

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, issued_at, expires_at, refresh_expires_at, mfa_required, ip, user_agent, refresh_token_hash, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
  )
    .bind(
      id,
      userId,
      issuedAt,
      expiresAt,
      refreshExpiresAt,
      options.mfaRequired ? 1 : 0,
      options.ip ?? null,
      options.userAgent ?? null,
      options.refreshTokenHash ?? null,
      issuedAt
    )
    .run();

  return {
    schema_version: SCHEMA_VERSION,
    id,
    user_id: userId,
    issued_at: issuedAt,
    expires_at: expiresAt,
    mfa_required: options.mfaRequired,
    ip: options.ip,
    ua: options.userAgent,
    refresh_expires_at: refreshExpiresAt ?? undefined,
  };
}

export async function getSession(env: Env, sessionId: string) {
  const record = await env.DB.prepare(`SELECT * FROM sessions WHERE id = ?1`).bind(sessionId).first<SessionRecord & {
    refresh_expires_at: string | null;
  }>();
  if (!record) return null;
  return {
    schema_version: SCHEMA_VERSION,
    id: record.id,
    user_id: record.user_id,
    issued_at: record.issued_at,
    expires_at: record.expires_at,
    mfa_required: Boolean(record.mfa_required),
    ip: record.ip ?? undefined,
    ua: record.user_agent ?? undefined,
    refresh_expires_at: record.refresh_expires_at ?? undefined,
  };
}

export async function getSessionWithSecrets(env: Env, sessionId: string) {
  const record = await env.DB.prepare(`SELECT * FROM sessions WHERE id = ?1`).bind(sessionId).first<SessionRecord & {
    refresh_expires_at: string | null;
  }>();
  if (!record) return null;
  return {
    session: {
      schema_version: SCHEMA_VERSION,
      id: record.id,
      user_id: record.user_id,
      issued_at: record.issued_at,
      expires_at: record.expires_at,
      mfa_required: Boolean(record.mfa_required),
      ip: record.ip ?? undefined,
      ua: record.user_agent ?? undefined,
      refresh_expires_at: record.refresh_expires_at ?? undefined,
    },
    refreshTokenHash: record.refresh_token_hash ?? undefined,
  };
}

export async function rotateSession(
  env: Env,
  sessionId: string,
  updates: {
    issuedAt: string;
    expiresAt: string;
    refreshTokenHash: string;
    refreshExpiresAt: string;
    ip?: string;
    userAgent?: string;
  }
) {
  await env.DB.prepare(
    `UPDATE sessions
     SET issued_at = ?1,
         expires_at = ?2,
         refresh_expires_at = ?3,
         refresh_token_hash = ?4,
         ip = COALESCE(?5, ip),
         user_agent = COALESCE(?6, user_agent)
     WHERE id = ?7`
  )
    .bind(
      updates.issuedAt,
      updates.expiresAt,
      updates.refreshExpiresAt,
      updates.refreshTokenHash,
      updates.ip ?? null,
      updates.userAgent ?? null,
      sessionId
    )
    .run();
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(sessionId).run();
}

export async function listCanvases(env: Env, userId: string) {
  const { results } = await env.DB.prepare(`SELECT * FROM canvases WHERE owner_id = ?1 ORDER BY created_at DESC`).bind(userId).all<CanvasRecord>();
  return results.map((row) =>
    canvasSchema.parse({
      schema_version: SCHEMA_VERSION,
      id: row.id,
      owner_id: row.owner_id,
      title: row.title,
      summary: row.summary ?? undefined,
      content: parseJson(row.content, {} as Record<string, unknown>),
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })
  );
}

export async function getCanvas(env: Env, userId: string, canvasId: string) {
  const record = await env.DB.prepare(`SELECT * FROM canvases WHERE id = ?1 AND owner_id = ?2`).bind(canvasId, userId).first<CanvasRecord>();
  if (!record) return null;
  return canvasSchema.parse({
    schema_version: SCHEMA_VERSION,
    id: record.id,
    owner_id: record.owner_id,
    title: record.title,
    summary: record.summary ?? undefined,
    content: parseJson(record.content, {} as Record<string, unknown>),
    status: record.status,
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
}

export async function saveCanvas(
  env: Env,
  userId: string,
  canvasId: string,
  updates: { title?: string; summary?: string; content?: Record<string, unknown>; status?: string; revision?: number }
) {
  const existing = await getCanvas(env, userId, canvasId);
  if (!existing) return null;

  const validated = canvasUpdateSchema.parse(updates);

  const latestVersion = await env.DB.prepare(
    `SELECT revision FROM canvas_versions WHERE canvas_id = ?1 ORDER BY revision DESC LIMIT 1`
  )
    .bind(canvasId)
    .first<{ revision: number }>();

  const currentRevision = latestVersion?.revision ?? 1;
  if (validated.revision !== undefined && validated.revision !== currentRevision) {
    throw new Error('revision_conflict');
  }

  const updated = canvasSchema.parse({
    ...existing,
    title: validated.title ?? existing.title,
    summary: validated.summary ?? existing.summary,
    content: validated.content ?? existing.content,
    status: validated.status ?? existing.status,
    updated_at: now(),
  });

  await env.DB.prepare(
    `UPDATE canvases
     SET title = ?1, summary = ?2, content = ?3, status = ?4, updated_at = ?5
     WHERE id = ?6 AND owner_id = ?7`
  )
    .bind(
      updated.title,
      updated.summary ?? null,
      JSON.stringify(updated.content),
      updated.status,
      updated.updated_at,
      canvasId,
      userId
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO canvas_versions (id, canvas_id, revision, content, diff, created_at, created_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  )
    .bind(
      randomId('cver'),
      canvasId,
      currentRevision + 1,
      JSON.stringify(updated.content),
      validated.revision !== undefined ? JSON.stringify({ base_revision: validated.revision }) : null,
      updated.updated_at,
      userId
    )
    .run();

  return updated;
}

export async function createCanvas(
  env: Env,
  userId: string,
  payload: { title: string; summary?: string; content: Record<string, unknown>; status: 'active' | 'archived' }
) {
  const id = randomId('canvas');
  const createdAt = now();
  const validated = canvasCreateSchema.parse(payload);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO canvases (id, owner_id, title, summary, content, status, schema_version, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`
    ).bind(
      id,
      userId,
      validated.title,
      validated.summary ?? null,
      JSON.stringify(validated.content),
      validated.status,
      SCHEMA_VERSION,
      createdAt
    ),
    env.DB.prepare(
      `INSERT INTO canvas_versions (id, canvas_id, revision, content, created_at, created_by)
       VALUES (?1, ?2, 1, ?3, ?4, ?5)`
    ).bind(randomId('cver'), id, JSON.stringify(validated.content), createdAt, userId)
  ]);

  return canvasSchema.parse({
    schema_version: SCHEMA_VERSION,
    id,
    owner_id: userId,
    title: validated.title,
    summary: validated.summary,
    content: validated.content,
    status: validated.status,
    created_at: createdAt,
    updated_at: createdAt,
  });
}

export async function listCanvasVersions(env: Env, userId: string, canvasId: string) {
  const canvas = await getCanvas(env, userId, canvasId);
  if (!canvas) return [];

  const { results } = await env.DB.prepare(
    `SELECT * FROM canvas_versions WHERE canvas_id = ?1 ORDER BY revision DESC`
  ).bind(canvasId).all<CanvasVersionRecord>();

  return results.map((row) =>
    canvasVersionSchema.parse({
      schema_version: SCHEMA_VERSION,
      id: row.id,
      canvas_id: row.canvas_id,
      revision: row.revision,
      content: parseJson(row.content, {} as Record<string, unknown>),
      diff: row.diff ? parseJson(row.diff, {} as Record<string, unknown>) : undefined,
      created_at: row.created_at,
      created_by: row.created_by,
    })
  );
}

export async function deleteCanvas(env: Env, userId: string, canvasId: string) {
  await env.DB.prepare(`DELETE FROM canvases WHERE id = ?1 AND owner_id = ?2`).bind(canvasId, userId).run();
}


export async function createSignupToken(env: Env, userId: string, ttlHours = 24) {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const record = await insertEmailToken(env, {
    purpose: 'signup',
    userId,
    expiresAt
  });
  return record;
}

export async function getEmailToken(env: Env, token: string, expectedPurpose: string) {
  const record = await env.DB.prepare(
    `SELECT * FROM email_tokens WHERE token = ?1 AND purpose = ?2`
  ).bind(token, expectedPurpose).first<EmailTokenRecord>();
  if (!record) return null;
  const nowTs = Date.now();
  const expires = Date.parse(record.expires_at);
  if (Number.isFinite(expires) && expires < nowTs) {
    return null;
  }
  if (record.used_at) {
    return null;
  }
  return record;
}

export async function markEmailTokenUsed(env: Env, tokenId: string) {
  await env.DB.prepare(`UPDATE email_tokens SET used_at = ?1 WHERE id = ?2`).bind(now(), tokenId).run();
}
