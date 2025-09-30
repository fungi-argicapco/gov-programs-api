import { describe, expect, it } from 'vitest';
import { deriveSuppressionState, normalizeEmail, type PostmarkWebhookPayload } from '../apps/canvas/src/suppressions';

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
