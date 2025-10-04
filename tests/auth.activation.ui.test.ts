import { describe, it, expect } from 'vitest';
import app from '../apps/api/src/index';

describe('activation ui', () => {
  const env = {
    SESSION_COOKIE_NAME: 'fungi_session',
    REFRESH_COOKIE_NAME: 'fungi_refresh',
    METRICS_DISABLE: '1'
  } as any;

  it('renders activation form when token present', async () => {
    const response = await app.fetch(new Request('http://localhost/account/activate?token=signup_test', { method: 'GET' }), env);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Activate your account');
    expect(html).toContain('id="activate-form"');
    expect(html).toContain('signup_test');
  });

  it('surfaces guidance when token missing', async () => {
    const response = await app.fetch(new Request('http://localhost/account/activate', { method: 'GET' }), env);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('activation link is empty or expired');
    expect(html).toContain('Request a fresh email');
  });
});
