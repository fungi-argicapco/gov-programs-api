import { describe, it, expect } from 'vitest';
import { TOTP } from 'otpauth';
import { createTestDB } from './helpers/d1';
import {
  createAccountRequest,
  updateAccountRequestStatus,
  ensureUserWithDefaultCanvas,
  createSignupToken,
  getEmailToken,
  listCanvases,
  listCanvasVersions,
  saveCanvas,
  createCanvas,
  createEmailToken,
} from '../apps/api/src/onboarding/storage';
import {
  acceptInvite,
  login,
  verifyMfaChallenge,
  startTotpEnrollment,
  confirmTotpEnrollment,
  refreshSession,
} from '../apps/api/src/security/auth';
import { buildDecisionEmail, buildSignupEmail } from '../apps/api/src/onboarding/email';

const schema = `
PRAGMA foreign_keys=ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  apps TEXT NOT NULL,
  roles TEXT NOT NULL DEFAULT '[]',
  password_hash TEXT,
  mfa_enrolled INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE mfa_methods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  secret TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE account_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  requested_apps TEXT NOT NULL,
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  reviewer_id TEXT,
  reviewer_comment TEXT
);
CREATE TABLE email_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  user_id TEXT,
  account_request_id TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (account_request_id) REFERENCES account_requests(id) ON DELETE CASCADE
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  refresh_expires_at TEXT,
  mfa_required INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  user_agent TEXT,
  refresh_token_hash TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE canvases (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE canvas_versions (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  diff TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
);
`;

describe('account onboarding, auth, and canvas lifecycle', () => {
  it('handles invite acceptance, MFA enrolment, session refresh, and canvas versioning', async () => {
    const db = createTestDB();
    await db.exec(schema);
    const env = { DB: db } as any;

    const requestedApps = { website: false, program: true, canvas: true };
    const account = await createAccountRequest(env, {
      email: 'founder@example.com',
      displayName: 'Founders Inc',
      requestedApps,
      justification: 'Exploring canvas workflows',
    });
    expect(account.accountRequest.status).toBe('pending');

    const approval = await updateAccountRequestStatus(
      env,
      account.accountRequest.id,
      'approved',
      'admin',
      'Looks great'
    );
    expect(approval?.status).toBe('approved');

    const userId = await ensureUserWithDefaultCanvas(env, {
      id: 'user_invitee',
      email: 'founder@example.com',
      display_name: 'Founders Inc',
      status: 'active',
      apps: requestedApps,
      roles: ['user'],
      mfa_enrolled: false,
    });

    const invite = await createSignupToken(env, userId, 24);
    const inviteEmail = buildSignupEmail({
      recipient: 'founder@example.com',
      token: invite.token,
      activationBaseUrl: 'https://program.fungiagricap.com/account/activate',
      expiresAt: invite.expiresAt,
    });
    expect(inviteEmail.subject).toContain('Activate');
    expect(inviteEmail.html).toContain(invite.token);

    const accepted = await acceptInvite(env, {
      token: invite.token,
      password: 'Sup3rSecure!PW',
      ip: '203.0.113.10',
      userAgent: 'vitest',
    });
    expect(accepted.status).toBe('ok');
    expect(accepted.user.email).toBe('founder@example.com');
    expect(accepted.session.mfa_required).toBe(false);
    expect(accepted.refresh_token).toHaveLength(64);

    const consumedToken = await getEmailToken(env, invite.token, 'signup');
    expect(consumedToken).toBeNull();

    const defaultCanvases = await listCanvases(env, userId);
    expect(defaultCanvases).toHaveLength(1);
    const defaultCanvas = defaultCanvases[0];
    expect(defaultCanvas.title).toBe('Lean Canvas Quickstart');

    const versionsBefore = await listCanvasVersions(env, userId, defaultCanvas.id);
    expect(versionsBefore).toHaveLength(1);
    expect(versionsBefore[0].revision).toBe(1);

    const updatedCanvas = await saveCanvas(env, userId, defaultCanvas.id, {
      title: 'Pitch Canvas',
      summary: 'Refined lean canvas for funding prep',
      content: { problem: ['Capital access'], solution: ['Dedicated concierge'] },
      revision: versionsBefore[0].revision,
    });
    expect(updatedCanvas.title).toBe('Pitch Canvas');
    expect(updatedCanvas.status).toBe('active');

    await expect(
      saveCanvas(env, userId, defaultCanvas.id, {
        title: 'Conflicting update',
        revision: 0,
      })
    ).rejects.toThrow('revision_conflict');

    const archived = await saveCanvas(env, userId, defaultCanvas.id, {
      status: 'archived',
      content: { archived: true },
    });
    expect(archived.status).toBe('archived');

    const versionsAfter = await listCanvasVersions(env, userId, defaultCanvas.id);
    expect(versionsAfter).toHaveLength(3);
    const latest = versionsAfter.find((entry) => entry.revision === 3);
    expect(latest).toBeDefined();
    const prior = versionsAfter.find((entry) => entry.revision === 2);
    expect(((prior?.diff ?? {}) as Record<string, unknown>).base_revision).toBe(1);

    const newCanvas = await createCanvas(env, userId, {
      title: 'Expansion Plan',
      summary: 'Internal planning document',
      content: { keyMetrics: ['MRR', 'Activation time'] },
      status: 'active',
    });
    expect(newCanvas.title).toBe('Expansion Plan');

    const passwordLogin = await login(env, {
      email: 'founder@example.com',
      password: 'Sup3rSecure!PW',
      ip: '198.51.100.2',
      userAgent: 'vitest',
    });
    expect(passwordLogin.status).toBe('ok');

    const enrollment = await startTotpEnrollment(env, userId);
    const totp = new TOTP({ issuer: 'fungiagricap', label: 'founder@example.com', secret: enrollment.secret });
    const totpCode = totp.generate();
    const confirmedProfile = await confirmTotpEnrollment(env, {
      userId,
      methodId: enrollment.method_id,
      code: totpCode,
    });
    expect(confirmedProfile.mfa_enrolled).toBe(true);

    const challenge = await login(env, {
      email: 'founder@example.com',
      password: 'Sup3rSecure!PW',
    });
    expect(challenge.status).toBe('mfa-required');
    if (challenge.status !== 'mfa-required') {
      throw new Error('expected mfa challenge');
    }
    const activeChallenge = challenge;
    const challengeTokenRecord = await getEmailToken(env, activeChallenge.challenge_id, 'mfa-challenge');
    expect(challengeTokenRecord).not.toBeNull();

    const secondCode = totp.generate();
    const mfaSession = await verifyMfaChallenge(env, {
      challengeId: activeChallenge.challenge_id,
      code: secondCode,
      ip: '203.0.113.11',
      userAgent: 'vitest-mfa',
    });
    expect(mfaSession.status).toBe('ok');
    expect(mfaSession.user.mfa_enrolled).toBe(true);

    const consumedChallenge = await getEmailToken(env, activeChallenge.challenge_id, 'mfa-challenge');
    expect(consumedChallenge).toBeNull();

    const expiring = await createEmailToken(env, {
      purpose: 'mfa-challenge',
      userId,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(await getEmailToken(env, expiring.token, 'mfa-challenge')).not.toBeNull();
    await env.DB.prepare('UPDATE email_tokens SET expires_at = ?1 WHERE id = ?2')
      .bind(new Date(Date.now() - 60_000).toISOString(), expiring.id)
      .run();
    expect(await getEmailToken(env, expiring.token, 'mfa-challenge')).toBeNull();

    const refreshed = await refreshSession(env, {
      sessionId: mfaSession.session.id,
      refreshToken: mfaSession.refresh_token,
      ip: '203.0.113.12',
      userAgent: 'vitest-refresh',
    });
    expect(refreshed.status).toBe('ok');
    expect(refreshed.refresh_token).not.toBe(mfaSession.refresh_token);
    expect(refreshed.session.id).toBe(mfaSession.session.id);

    const storedBeforeInvalid = await env.DB.prepare(
      'SELECT refresh_token_hash, refresh_expires_at FROM sessions WHERE id = ?1'
    )
      .bind(refreshed.session.id)
      .first<{ refresh_token_hash: string; refresh_expires_at: string }>();
    expect(typeof storedBeforeInvalid?.refresh_token_hash).toBe('string');
    expect(Date.parse(storedBeforeInvalid?.refresh_expires_at ?? '')).toBeGreaterThan(Date.now());

    await expect(
      refreshSession(env, {
        sessionId: mfaSession.session.id,
        refreshToken: mfaSession.refresh_token,
      })
    ).rejects.toThrow();

    const storedSession = await env.DB.prepare('SELECT refresh_token_hash, refresh_expires_at FROM sessions WHERE id = ?1')
      .bind(refreshed.session.id)
      .first<{ refresh_token_hash: string; refresh_expires_at: string }>();
    expect(storedSession).toBeNull();
  });
});

describe('email templates', () => {
  it('produces admin decision emails with actionable links', () => {
    const payload = buildDecisionEmail({
      recipient: 'admin@example.com',
      token: 'decision_abc',
      decisionBaseUrl: 'https://program.fungiagricap.com/admin/account/decision',
    });
    expect(payload.subject).toContain('canvas access request');
    expect(payload.html).toContain('decision_abc');
  });
});
