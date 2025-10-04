import type { Context } from 'hono';
import type { Env } from '../db';
import type { AuthVariables } from '../mw.auth';

export function activationUi(c: Context<{ Bindings: Env; Variables: AuthVariables }>): string {
  const token = c.req.query('token') ?? '';
  const tokenValue = JSON.stringify(token);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Activate account · Government Programs Ops</title>
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
      main {
        width: min(560px, 100%);
        display: grid;
        gap: 20px;
      }
      form, section.notice {
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
      .secondary-btn {
        background: rgba(15, 23, 42, 0.7);
        color: rgba(226, 232, 240, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.32);
        box-shadow: none;
      }
      .error {
        display: none;
        padding: 12px;
        border-radius: 12px;
        font-size: 0.95rem;
        background: rgba(239, 68, 68, 0.16);
        border: 1px solid rgba(239, 68, 68, 0.32);
        color: #fecaca;
      }
      .error.visible {
        display: block;
      }
      .status-success {
        display: none;
        padding: 12px;
        border-radius: 12px;
        font-size: 0.95rem;
        background: rgba(16, 185, 129, 0.18);
        border: 1px solid rgba(16, 185, 129, 0.35);
        color: #bbf7d0;
      }
      .status-success.visible {
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
    <main>
      <form id="activate-form">
        <div>
          <h1>Activate your account</h1>
          <p>Choose a password to finish setting up your fungiagricap access.</p>
        </div>
        <div id="error" class="error" role="alert"></div>
        <div id="success" class="status-success" role="status"></div>
        <label>
          New password
          <input id="password" name="password" type="password" autocomplete="new-password" required />
        </label>
        <label>
          Confirm password
          <input id="confirm" name="confirm" type="password" autocomplete="new-password" required />
        </label>
        <button id="submit" type="submit">Set password & continue</button>
        <p style="text-align:center;font-size:0.85rem;">Already activated? <a class="link" href="/account/login">Sign in</a></p>
      </form>
      <section class="notice" id="token-missing" hidden>
        <p>This activation link is empty or expired. Request a fresh email from the <a class="link" href="/account/login">sign-in page</a>.</p>
      </section>
    </main>

    <script>
      (function () {
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        const presetToken = ${tokenValue};
        const token = urlToken || presetToken;
        const form = document.getElementById('activate-form');
        const password = document.getElementById('password');
        const confirm = document.getElementById('confirm');
        const submit = document.getElementById('submit');
        const errorEl = document.getElementById('error');
        const successEl = document.getElementById('success');
        const tokenNotice = document.getElementById('token-missing');

        function showError(message) {
          errorEl.textContent = message;
          errorEl.classList.add('visible');
        }

        function clearError() {
          errorEl.textContent = '';
          errorEl.classList.remove('visible');
        }

        function showSuccess(message) {
          successEl.textContent = message;
          successEl.classList.add('visible');
        }

        function disableForm(disabled) {
          [password, confirm, submit].forEach((el) => {
            if (el) el.disabled = disabled;
          });
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

        if (!token) {
          disableForm(true);
          tokenNotice?.removeAttribute('hidden');
          showError('This activation link is missing its token. Request a new email to continue.');
          return;
        }

        form?.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearError();
          successEl.classList.remove('visible');

          const passwordValue = password?.value || '';
          const confirmValue = confirm?.value || '';
          if (passwordValue.length < 12) {
            showError('Password must be at least 12 characters.');
            return;
          }
          if (!/[A-Z]/.test(passwordValue) || !/[a-z]/.test(passwordValue) || !/[0-9]/.test(passwordValue) || !/[^A-Za-z0-9]/.test(passwordValue)) {
            showError('Use upper, lower, number, and symbol characters.');
            return;
          }
          if (passwordValue !== confirmValue) {
            showError('Passwords do not match.');
            return;
          }

          disableForm(true);
          try {
            await requestJson('/v1/account/activate', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ token, password: passwordValue }),
            });
            showSuccess('Account activated! Redirecting you to the console…');
            setTimeout(() => {
              window.location.href = '/admin';
            }, 1200);
          } catch (error) {
            showError(error instanceof Error ? error.message : 'Activation failed.');
            disableForm(false);
          }
        });
      })();
    </script>
  </body>
</html>`;
}
