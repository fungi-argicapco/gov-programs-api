import type { Context } from 'hono';
import type { Env } from '../db';
import type { AuthVariables } from '../mw.auth';

export function adminDecisionUi(_c: Context<{ Bindings: Env; Variables: AuthVariables }>): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Handle Access Request · Gov Programs</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }
      body {
        margin: 0;
        padding: 32px 16px 64px;
        display: flex;
        justify-content: center;
      }
      main {
        width: min(640px, 100%);
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 18px;
        padding: 28px;
        box-shadow: 0 30px 80px rgba(15, 23, 42, 0.45);
      }
      h1 {
        font-size: 1.6rem;
        margin: 0 0 4px;
        color: rgba(248, 250, 252, 0.95);
      }
      p {
        margin: 0 0 16px;
        line-height: 1.5;
        color: rgba(226, 232, 240, 0.85);
      }
      form {
        display: grid;
        gap: 16px;
        margin-top: 12px;
      }
      label {
        font-weight: 600;
        font-size: 0.95rem;
        color: rgba(248, 250, 252, 0.9);
      }
      input[type="text"], textarea, select {
        width: 100%;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: rgba(15, 23, 42, 0.65);
        color: inherit;
        font: inherit;
      }
      textarea {
        min-height: 110px;
        resize: vertical;
      }
      fieldset {
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 12px;
        padding: 16px;
      }
      legend {
        padding: 0 6px;
        font-weight: 600;
      }
      .actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 140px;
        padding: 10px 16px;
        border-radius: 999px;
        border: 1px solid transparent;
        font-weight: 600;
        cursor: pointer;
        font-size: 0.95rem;
      }
      button.primary {
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.9), rgba(59, 130, 246, 0.9));
        border-color: rgba(125, 211, 252, 0.35);
        color: #0f172a;
      }
      button.secondary {
        background: rgba(15, 23, 42, 0.75);
        border-color: rgba(148, 163, 184, 0.4);
        color: rgba(226, 232, 240, 0.95);
      }
      button:disabled {
        opacity: 0.65;
        cursor: wait;
      }
      .status {
        padding: 12px 14px;
        border-radius: 12px;
        margin-bottom: 8px;
        display: none;
        font-size: 0.95rem;
      }
      .status--visible {
        display: block;
      }
      .status--error {
        background: rgba(239, 68, 68, 0.16);
        color: #fecaca;
        border: 1px solid rgba(239, 68, 68, 0.3);
      }
      .status--success {
        background: rgba(16, 185, 129, 0.18);
        color: #bbf7d0;
        border: 1px solid rgba(16, 185, 129, 0.35);
      }
      .request-meta {
        margin: 18px 0 0;
        padding: 14px 16px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.25);
        background: rgba(15, 23, 42, 0.55);
        font-size: 0.92rem;
      }
      .request-meta dt {
        font-weight: 600;
        margin: 0 0 4px;
      }
      .request-meta dd {
        margin: 0 0 10px;
        color: rgba(226, 232, 240, 0.75);
      }
      footer {
        margin-top: 32px;
        font-size: 0.8rem;
        color: rgba(148, 163, 184, 0.7);
        text-align: center;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Review access request</h1>
      <p>
        Approve or decline the pending workspace request using the secure decision token below. We
        will notify the requester automatically once you record a decision.
      </p>
      <div id="status" class="status" role="status" aria-live="polite"></div>
      <form id="decision-form">
        <label for="token">Decision token</label>
        <input id="token" name="token" type="text" autocomplete="off" spellcheck="false" required />

        <fieldset>
          <legend>Decision</legend>
          <label style="display:flex; gap:8px; align-items:center;">
            <input type="radio" name="decision" value="approve" checked />
            Approve access request
          </label>
          <label style="display:flex; gap:8px; align-items:center; margin-top:8px;">
            <input type="radio" name="decision" value="decline" />
            Decline access request
          </label>
        </fieldset>

        <label for="comment">Operator note <span style="font-weight:400; opacity:0.8;">(optional)</span></label>
        <textarea id="comment" name="comment" placeholder="Context for the requester or the audit log"></textarea>

        <div class="actions">
          <button id="submit-btn" class="primary" type="submit">Submit decision</button>
          <button id="reset-btn" class="secondary" type="button">Reset form</button>
        </div>
      </form>

      <dl id="request-meta" class="request-meta" hidden>
        <dt>Requester</dt>
        <dd id="requester-email">—</dd>
        <dt>Decision recorded</dt>
        <dd id="decision-result">—</dd>
      </dl>

      <footer>Government Programs API · Operations console</footer>
    </main>

    <script>
      (function () {
        const params = new URLSearchParams(window.location.search);
        const tokenField = document.getElementById('token');
        const commentField = document.getElementById('comment');
        const statusEl = document.getElementById('status');
        const form = document.getElementById('decision-form');
        const submitBtn = document.getElementById('submit-btn');
        const resetBtn = document.getElementById('reset-btn');
        const requestMeta = document.getElementById('request-meta');
        const requesterEmail = document.getElementById('requester-email');
        const decisionResult = document.getElementById('decision-result');

        function setStatus(message, tone) {
          statusEl.textContent = message;
          statusEl.className = 'status status--visible ' + (tone === 'error' ? 'status--error' : 'status--success');
        }

        function clearStatus() {
          statusEl.textContent = '';
          statusEl.className = 'status';
        }

        function disableForm(disabled) {
          submitBtn.disabled = disabled;
          Array.from(form.elements).forEach((el) => {
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement) {
              el.disabled = disabled && el !== resetBtn;
            }
          });
        }

        function getDecision() {
          const radio = form.querySelector('input[name="decision"]:checked');
          return radio ? radio.value : 'approve';
        }

        function prefillFromQuery() {
          const token = params.get('token');
          if (token) {
            tokenField.value = token;
          }
          const decision = params.get('decision');
          if (decision && (decision === 'approve' || decision === 'decline')) {
            const radio = form.querySelector('input[name="decision"][value="' + decision + '"]');
            if (radio) {
              radio.checked = true;
            }
          }
          const comment = params.get('comment');
          if (comment) {
            commentField.value = comment;
          }
        }

        async function submitDecision(decisionOverride) {
          clearStatus();
          const token = tokenField.value.trim();
          const decision = decisionOverride || getDecision();
          const reviewerComment = commentField.value.trim() || undefined;

          if (!token) {
            setStatus('Decision token is required.', 'error');
            return;
          }

          disableForm(true);
          try {
            const response = await fetch('/v1/account/decision', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ token, decision, reviewer_comment: reviewerComment })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              const fallback = payload?.error_description || payload?.error || response.statusText;
              throw new Error(fallback || 'Unable to record decision.');
            }

            requesterEmail.textContent = payload?.request?.email || '—';
            decisionResult.textContent = payload?.status || decision;
            requestMeta.hidden = false;
            setStatus('Decision recorded successfully.', 'success');
          } catch (err) {
            setStatus(err.message || String(err), 'error');
          } finally {
            disableForm(false);
          }
        }

        form.addEventListener('submit', (event) => {
          event.preventDefault();
          submitDecision();
        });

        resetBtn.addEventListener('click', () => {
          form.reset();
          clearStatus();
          requestMeta.hidden = true;
          tokenField.focus();
        });

        prefillFromQuery();

        const autoDecision = params.get('decision');
        if (tokenField.value && (autoDecision === 'approve' || autoDecision === 'decline')) {
          submitDecision(autoDecision);
        }
      })();
    </script>
  </body>
</html>`;
}
