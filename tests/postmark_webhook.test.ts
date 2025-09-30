import { Buffer } from 'node:buffer';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { handlePostmarkWebhook } from '../apps/canvas/src/postmark_webhook';
import { type CanvasEnv } from '../apps/canvas/src/env';
import * as suppressions from '../apps/canvas/src/suppressions';
import type { NormalizedSuppressionEvent } from '../apps/canvas/src/suppressions';
import type { SuppressionPersistenceResult } from '../apps/canvas/src/suppressions';

const SECRET = 'sandbox-secret';
const SIGNATURE_HEADER = 'X-Postmark-Signature';

async function createSignedRequest(body: unknown, secret: string, overrides?: RequestInit): Promise<Request> {
  const payload = JSON.stringify(body);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const signature = Buffer.from(mac).toString('base64');
  return new Request('https://example.com/api/postmark/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'Content-Type': 'application/json',
      [SIGNATURE_HEADER]: signature
    },
    ...overrides
  });
}

describe('handlePostmarkWebhook', () => {
  const env: CanvasEnv = { POSTMARK_WEBHOOK_SECRET: SECRET } as CanvasEnv;
  let suppressionSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  function persisted(event: Partial<NormalizedSuppressionEvent>): SuppressionPersistenceResult {
    return {
      status: 'persisted',
      event: {
        email: 'user@example.com',
        recordType: event.recordType ?? 'Bounce',
        suppressed: event.suppressed ?? true,
        reason: event.reason ?? null,
        description: event.description ?? null,
        details: event.details ?? null,
        occurredAt: event.occurredAt ?? '2024-01-01T00:00:00Z',
        messageStream: event.messageStream ?? 'sandbox',
        recordId: event.recordId ?? 'abc'
      }
    };
  }

  beforeEach(() => {
    suppressionSpy = vi
      .spyOn(suppressions, 'recordSuppressionEvent')
      .mockResolvedValue(persisted({}));
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    suppressionSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('rejects non-POST requests', async () => {
    const request = new Request('https://example.com/api/postmark/webhook', { method: 'GET' });
    const response = await handlePostmarkWebhook(request, env);
    expect(response.status).toBe(405);
  });

  it('enforces signature validation when a secret is configured', async () => {
    const body = { RecordType: 'Bounce', Email: 'user@example.com', MessageStream: 'sandbox' };
    const request = await createSignedRequest(body, SECRET);
    const response = await handlePostmarkWebhook(request, env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(suppressionSpy).toHaveBeenCalledWith(env, body);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Postmark webhook processed:',
      expect.objectContaining({ persisted: 1, skipped: 0, failures: 0 })
    );
  });

  it('returns 403 when the signature is missing', async () => {
    const body = { RecordType: 'SpamComplaint', Email: 'user@example.com', MessageStream: 'sandbox' };
    const request = new Request('https://example.com/api/postmark/webhook', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const response = await handlePostmarkWebhook(request, env);
    expect(response.status).toBe(403);
    expect(suppressionSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('returns 403 when the signature does not match', async () => {
    const body = { RecordType: 'Bounce', Email: 'user@example.com', MessageStream: 'sandbox' };
    const request = await createSignedRequest(body, 'wrong-secret');
    const response = await handlePostmarkWebhook(request, env);
    expect(response.status).toBe(403);
    expect(suppressionSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('accepts events when no webhook secret is configured', async () => {
    const body = { RecordType: 'Bounce', Email: 'user@example.com', MessageStream: 'sandbox' };
    const envWithoutSecret: CanvasEnv = { ...env, POSTMARK_WEBHOOK_SECRET: undefined };
    const request = new Request('https://example.com/api/postmark/webhook', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const response = await handlePostmarkWebhook(request, envWithoutSecret);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(suppressionSpy).toHaveBeenCalledWith(envWithoutSecret, body);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Postmark webhook processed:',
      expect.objectContaining({ persisted: 1 })
    );
  });

  it('logs metrics when multiple events are processed', async () => {
    const events = [
      { RecordType: 'Bounce', Email: 'one@example.com', MessageStream: 'sandbox' },
      { RecordType: 'Delivery', Email: 'two@example.com', MessageStream: 'sandbox' }
    ];

    suppressionSpy.mockResolvedValueOnce(
      persisted({ recordType: 'Bounce', suppressed: true, messageStream: 'sandbox' })
    );
    suppressionSpy.mockResolvedValueOnce({ status: 'skipped', reason: 'invalid-payload' });

    const request = await createSignedRequest(events, SECRET);
    const response = await handlePostmarkWebhook(request, env);

    expect(response.status).toBe(200);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Postmark webhook processed:',
      expect.objectContaining({
        received: 2,
        persisted: 1,
        skipped: 1,
        failures: 0,
        countsByRecordType: expect.objectContaining({ Bounce: 1 }),
        skippedByReason: expect.objectContaining({ 'invalid-payload': 1 })
      })
    );
  });

  it('returns 500 when persistence fails and logs error metrics', async () => {
    const events = [
      { RecordType: 'Bounce', Email: 'one@example.com', MessageStream: 'sandbox' },
      { RecordType: 'SpamComplaint', Email: 'two@example.com', MessageStream: 'sandbox' }
    ];

    suppressionSpy.mockResolvedValueOnce(
      persisted({ recordType: 'Bounce', suppressed: true, messageStream: 'sandbox' })
    );
    suppressionSpy.mockImplementationOnce(async () => {
      throw new Error('db unavailable');
    });

    const request = await createSignedRequest(events, SECRET);
    const response = await handlePostmarkWebhook(request, env);

    expect(response.status).toBe(500);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Postmark webhook persistence failed:',
      expect.objectContaining({ failures: 1, persisted: 1 })
    );
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});
