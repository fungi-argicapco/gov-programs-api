import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deriveSuppressionState,
  normalizeEmail,
  recordSuppressionEvent,
  type PostmarkWebhookPayload
} from '../apps/canvas/src/suppressions';
import { createTestDB } from './helpers/d1';

const readMigration = (name: string) => fs.readFileSync(path.join(process.cwd(), 'migrations', name), 'utf-8');

describe('normalizeEmail', () => {
  it('returns lower-cased email', () => {
    expect(normalizeEmail('User@Example.COM ')).toBe('user@example.com');
  });

  it('returns null for blank values', () => {
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe('deriveSuppressionState', () => {
  it('normalizes bounce events', () => {
    const payload: PostmarkWebhookPayload = {
      RecordType: 'Bounce',
      Email: 'Person@Example.com',
      Type: 'HardBounce',
      Description: 'Mailbox not found',
      Details: 'Test',
      BouncedAt: '2024-01-01T00:00:00Z',
      MessageID: 'abc-123',
      MessageStream: 'outbound'
    };
    const result = deriveSuppressionState(payload);
    expect(result).not.toBeNull();
    expect(result?.email).toBe('person@example.com');
    expect(result?.suppressed).toBe(true);
    expect(result?.recordType).toBe('Bounce');
    expect(result?.occurredAt).toBe('2024-01-01T00:00:00Z');
    expect(result?.messageStream).toBe('outbound');
    expect(result?.recordId).toBe('abc-123');
  });

  it('normalizes delivery events as non-suppressed', () => {
    const payload: PostmarkWebhookPayload = {
      RecordType: 'Delivery',
      Recipient: 'deliver@example.com',
      DeliveredAt: '2024-02-02T00:00:00Z',
      MessageID: 'xyz',
      MessageStream: 'broadcast'
    };
    const result = deriveSuppressionState(payload);
    expect(result).not.toBeNull();
    expect(result?.suppressed).toBe(false);
    expect(result?.messageStream).toBe('broadcast');
    expect(result?.recordId).toBe('xyz');
  });

  it('returns null when no recipient present', () => {
    const payload: PostmarkWebhookPayload = {
      RecordType: 'Bounce'
    };
    expect(deriveSuppressionState(payload)).toBeNull();
  });
});

describe('recordSuppressionEvent', () => {
  let env: { DB: ReturnType<typeof createTestDB> };

  beforeEach(() => {
    const db = createTestDB();
    db.__db__.exec(readMigration('0011_postmark_suppressions.sql'));
    env = { DB: db };
  });

  it('persists suppression events and returns normalized data', async () => {
    const payload: PostmarkWebhookPayload = {
      RecordType: 'Bounce',
      Email: 'persist@example.com',
      Type: 'HardBounce',
      MessageStream: 'outbound',
      BouncedAt: '2024-03-01T00:00:00Z',
      MessageID: 'evt-1'
    };

    const result = await recordSuppressionEvent(env as any, payload);
    expect(result.status).toBe('persisted');
    if (result.status !== 'persisted') return;
    expect(result.event.email).toBe('persist@example.com');
    expect(result.event.recordType).toBe('Bounce');
    expect(result.event.messageStream).toBe('outbound');

    const suppressionRow = await env.DB
      .prepare('SELECT suppressed, last_event_type, message_stream FROM email_suppressions WHERE email = ?1')
      .bind('persist@example.com')
      .first<{ suppressed: number; last_event_type: string; message_stream: string }>();
    expect(suppressionRow).not.toBeNull();
    expect(suppressionRow?.suppressed).toBe(1);
    expect(suppressionRow?.last_event_type).toBe('Bounce');
    expect(suppressionRow?.message_stream).toBe('outbound');

    const eventsRow = await env.DB
      .prepare('SELECT event_type, message_stream, record_id FROM email_suppression_events WHERE email = ?1')
      .bind('persist@example.com')
      .first<{ event_type: string; message_stream: string; record_id: string }>();
    expect(eventsRow).not.toBeNull();
    expect(eventsRow?.event_type).toBe('Bounce');
    expect(eventsRow?.record_id).toBe('evt-1');
  });

  it('returns skipped result when payload is invalid', async () => {
    const payload: PostmarkWebhookPayload = { RecordType: 'Bounce' };
    const result = await recordSuppressionEvent(env as any, payload);
    expect(result).toEqual({ status: 'skipped', reason: 'invalid-payload' });
  });

  it('returns skipped result when DB binding is missing', async () => {
    const payload: PostmarkWebhookPayload = {
      RecordType: 'Bounce',
      Email: 'skip@example.com'
    };

    const missingEnv = {};
    const result = await recordSuppressionEvent(missingEnv as any, payload);
    expect(result).toEqual({ status: 'skipped', reason: 'missing-db' });
  });
});
