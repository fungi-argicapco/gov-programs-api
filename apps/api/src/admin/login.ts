import type { Context } from 'hono';
import type { Env } from '../db';
import type { AuthVariables } from '../mw.auth';

export function loginUi(c: Context<{ Bindings: Env; Variables: AuthVariables }>): string {
  const next = c.req.query('next') ?? '/admin';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Sign in · Government Programs Ops</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light dark;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #0f172a;
        color: #f1f5f9;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px 16px;
        background: radial-gradient(circle at top, rgba(59, 130, 246, 0.18), transparent 55%), #0f172a;
      }
      form {
        width: min(420px, 100%);
        background: rgba(15, 23, 42, 0.88);
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 20px;
        padding: 32px;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.54);
        display: grid;
        gap: 18px;
      }
      h1 {
        margin: 0;
        font-size: 1.6rem;
        color: #f8fafc;
      }
      p {
        margin: 0;
        color: rgba(148, 163, 184, 0.82);
        font-size: 0.95rem;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 0.92rem;
        color: rgba(226, 232, 240, 0.9);
      }
      input {
        padding: 10px 14px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: rgba(15, 23, 42, 0.7);
        color: inherit;
        font: inherit;
      }
      button {
        margin-top: 8px;
        padding: 10px 16px;
        border-radius: 999px;
        border: none;
        font-weight: 600;
        cursor: pointer;
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.9), rgba(59, 130, 246, 0.92));
        color: #04121f;
        box-shadow: 0 14px 38px rgba(59, 130, 246, 0.35);
      }
      button:disabled {
        opacity: 0.6;
        cursor: wait;
      }
      .error {
        display: none;
        padding: 12px;
        border-radius: 12px;
        background: rgba(239, 68, 68, 0.16);
        border: 1px solid rgba(239, 68, 68, 0.32);
        color: #fecaca;
        font-size: 0.95rem;
      }
      .error.visible {
        display: block;
      }
      .link {
        color: rgba(125, 211, 252, 0.95);
        text-decoration: none;
        font-weight: 500;
        font-size: 0.9rem;
      }
    </style>
  </head>
  <body>
    <form id="login-form">
      <div>
        <h1>Sign in</h1>
        <p>Access the fungiagricap operations console.</p>
      </div>
      <div id="error" class="error" role="alert"></div>
      <label>
        Email
        <input id="email" name="email" type="email" autocomplete="email" required />
      </label>
      <label>
        Password
        <input id="password" name="password" type="password" autocomplete="current-password" required />
      </label>
      <label id="totp-field" hidden>
        MFA code
        <input id="totp" name="totp" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" />
      </label>
      <button id="submit" type="submit">Continue</button>
      <p style="text-align:center;font-size:0.85rem;">Need an account? <a class="link" href="/">Request access</a></p>
    </form>

    <script>
      (function () {
        const form = document.getElementById('login-form');
        const email = document.getElementById('email');
        const password = document.getElementById('password');
        const totpWrapper = document.getElementById('totp-field');
        const totpInput = document.getElementById('totp');
        const submitBtn = document.getElementById('submit');
        const errorEl = document.getElementById('error');
        const params = new URLSearchParams(window.location.search);
        const redirectTo = params.get('next') || ${JSON.stringify(next)};
        let challengeId = null;

        function showError(message) {
          errorEl.textContent = message;
          errorEl.classList.add('visible');
        }

        function clearError() {
          errorEl.textContent = '';
          errorEl.classList.remove('visible');
        }

        async function requestJson(url, options) {
          const response = await fetch(url, {
            credentials: 'include',
            ...options,
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            const msg = payload?.error_description || payload?.error || response.statusText;
            throw new Error(msg);
          }
          return payload;
        }

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearError();
          submitBtn.disabled = true;
          try {
            if (challengeId) {
              const code = totpInput.value.trim();
              if (!code) {
                throw new Error('Enter the 6 digit MFA code.');
              }
              await requestJson('/v1/auth/mfa/challenge', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ challenge_id: challengeId, code })
              });
              window.location.href = redirectTo;
              return;
            }

            const payload = await fetch('/v1/auth/login', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                email: email.value.trim(),
                password: password.value,
                totp_code: totpInput.value.trim() || undefined,
              })
            });
            const data = await payload.json().catch(() => ({}));
            if (payload.status === 401 && data?.status === 'mfa-required') {
              challengeId = data.challenge_id;
              totpWrapper.hidden = false;
              totpInput.focus();
              showError('Enter your 6 digit MFA code to continue.');
              return;
            }
            if (!payload.ok) {
              const msg = data?.error_description || data?.error || payload.statusText;
              throw new Error(msg);
            }
            window.location.href = redirectTo;
          } catch (error) {
            showError(error.message || String(error));
            submitBtn.disabled = false;
          }
        });
      })();
    </script>
  </body>
</html>`;
}
