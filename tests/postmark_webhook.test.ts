import { Buffer } from 'node:buffer';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { handlePostmarkWebhook } from '../apps/canvas/src/postmark_webhook';
import { type CanvasEnv } from '../apps/canvas/src/env';
import * as suppressions from '../apps/canvas/src/suppressions';

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

  beforeEach(() => {
    suppressionSpy = vi.spyOn(suppressions, 'recordSuppressionEvent').mockResolvedValue();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    suppressionSpy.mockRestore();
    consoleErrorSpy.mockRestore();
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
  });

  it('returns 403 when the signature does not match', async () => {
    const body = { RecordType: 'Bounce', Email: 'user@example.com', MessageStream: 'sandbox' };
    const request = await createSignedRequest(body, 'wrong-secret');
    const response = await handlePostmarkWebhook(request, env);
    expect(response.status).toBe(403);
    expect(suppressionSpy).not.toHaveBeenCalled();
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
  });
});
