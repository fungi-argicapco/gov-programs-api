import { describe, it, expect } from 'vitest';
import { createTestDB } from './helpers/d1';
import {
  createEmailToken,
  getEmailToken,
  markEmailTokenUsed,
} from '../apps/api/src/onboarding/storage';

const schema = `
PRAGMA foreign_keys=OFF;
CREATE TABLE email_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  user_id TEXT,
  account_request_id TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
`;

describe('email token lifecycle', () => {
  it('issues and retrieves active tokens', async () => {
    const db = createTestDB();
    await db.exec(schema);
    const env = { DB: db } as any;

    const issued = await createEmailToken(env, {
      purpose: 'signup',
      userId: 'user_123',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const fetched = await getEmailToken(env, issued.token, 'signup');
    expect(fetched?.id).toBe(issued.id);
    expect(fetched?.user_id).toBe('user_123');
    expect(fetched?.purpose).toBe('signup');
  });

  it('marks tokens as used and prevents reuse', async () => {
    const db = createTestDB();
    await db.exec(schema);
    const env = { DB: db } as any;

    const issued = await createEmailToken(env, { purpose: 'mfa-challenge', userId: 'user_456' });
    const beforeUse = await getEmailToken(env, issued.token, 'mfa-challenge');
    expect(beforeUse).not.toBeNull();

    await markEmailTokenUsed(env, issued.id);

    const afterUse = await getEmailToken(env, issued.token, 'mfa-challenge');
    expect(afterUse).toBeNull();
  });

  it('expires tokens once the TTL passes', async () => {
    const db = createTestDB();
    await db.exec(schema);
    const env = { DB: db } as any;

    const issued = await createEmailToken(env, { purpose: 'mfa-challenge', userId: 'user_789' });
    await db
      .prepare('UPDATE email_tokens SET expires_at = ?1 WHERE id = ?2')
      .bind(new Date(Date.now() - 5 * 60 * 1000).toISOString(), issued.id)
      .run();

    const fetched = await getEmailToken(env, issued.token, 'mfa-challenge');
    expect(fetched).toBeNull();
  });

  it('rejects lookups when purpose does not match', async () => {
    const db = createTestDB();
    await db.exec(schema);
    const env = { DB: db } as any;

    const issued = await createEmailToken(env, { purpose: 'signup', userId: 'user_101' });
    const mismatch = await getEmailToken(env, issued.token, 'mfa-challenge');
    expect(mismatch).toBeNull();
  });
});
