import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

import { createMailService } from './provider';
import type { Env } from '../db';

const sampleMessage = {
  from: 'noreply@example.com',
  to: 'user@example.com',
  subject: 'Test',
  html: '<p>Test</p>',
  text: 'Test',
};

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe('Email provider factory', () => {
  it('defaults to console provider when EMAIL_PROVIDER is not set', async () => {
    const env = {} as Env;
    const service = createMailService(env);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await service.send(sampleMessage);

    expect(infoSpy).toHaveBeenCalledWith('Email send (console provider)', expect.objectContaining({
      from: sampleMessage.from,
      to: sampleMessage.to,
      subject: sampleMessage.subject,
    }));
  });

  it('throws when postmark provider is selected without token', () => {
    const env = {
      EMAIL_PROVIDER: 'postmark',
    } as Env;

    expect(() => createMailService(env)).toThrow(/POSTMARK_TOKEN/);
  });

  it('sends email through postmark when configured', async () => {
    const env = {
      EMAIL_PROVIDER: 'postmark',
      POSTMARK_TOKEN: 'token-123',
    } as Env;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    // @ts-expect-error – injected mock for tests
    globalThis.fetch = fetchMock;

    const service = createMailService(env);
    await service.send(sampleMessage);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.postmarkapp.com/email');
    expect(options).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        'X-Postmark-Server-Token': 'token-123',
      }),
    });
    expect(JSON.parse(options.body as string)).toMatchObject({
      From: sampleMessage.from,
      To: sampleMessage.to,
      Subject: sampleMessage.subject,
    });
  });

  it('surfaces postmark errors with response payload', async () => {
    const env = {
      EMAIL_PROVIDER: 'postmark',
      POSTMARK_TOKEN: 'token-123',
    } as Env;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ Message: 'Invalid token' }),
    } as Response);
    // @ts-expect-error – injected mock for tests
    globalThis.fetch = fetchMock;

    const service = createMailService(env);
    await expect(service.send(sampleMessage)).rejects.toThrow(/Postmark request failed/);
  });
});
