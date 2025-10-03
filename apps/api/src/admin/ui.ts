import type { Context } from 'hono';
import type { Env } from '../db';
import type { AuthVariables } from '../mw.auth';

export function adminUi(_c: Context<{ Bindings: Env; Variables: AuthVariables }>): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Operations Console · Government Programs</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light dark;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }
      body {
        margin: 0;
        padding: 0;
        min-height: 100vh;
        background: radial-gradient(circle at top, rgba(56, 189, 248, 0.08), transparent 55%), #0f172a;
      }
      header {
        padding: 32px clamp(24px, 4vw, 56px) 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      header h1 {
        margin: 0;
        font-size: clamp(1.6rem, 2.4vw, 2.2rem);
        color: #f8fafc;
      }
      header p {
        margin: 0;
        color: rgba(226, 232, 240, 0.76);
        max-width: 640px;
      }
      main {
        padding: 0 clamp(24px, 4vw, 56px) 64px;
        display: grid;
        gap: 32px;
      }
      .card {
        background: rgba(15, 23, 42, 0.88);
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 20px;
        padding: clamp(18px, 3vw, 26px);
        box-shadow: 0 18px 55px rgba(15, 23, 42, 0.45);
      }
      .card h2 {
        margin: 0 0 12px;
        font-size: 1.2rem;
        color: #f8fafc;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 12px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        text-align: left;
        vertical-align: top;
        font-size: 0.95rem;
      }
      th {
        font-weight: 600;
        color: rgba(226, 232, 240, 0.92);
      }
      tbody tr:last-child td {
        border-bottom: none;
      }
      .empty {
        padding: 18px;
        border-radius: 14px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px dashed rgba(148, 163, 184, 0.3);
        text-align: center;
        color: rgba(148, 163, 184, 0.85);
      }
      .actions {
        display: inline-flex;
        gap: 10px;
      }
      button {
        border: none;
        border-radius: 999px;
        padding: 8px 16px;
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.12s ease, box-shadow 0.12s ease;
      }
      button.primary {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.92), rgba(59, 130, 246, 0.92));
        color: #04111f;
        box-shadow: 0 10px 30px rgba(59, 130, 246, 0.25);
      }
      button.secondary {
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(148, 163, 184, 0.35);
        color: rgba(226, 232, 240, 0.95);
      }
      button:hover {
        transform: translateY(-1px);
      }
      button:disabled {
        opacity: 0.6;
        cursor: wait;
        transform: none;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 0.82rem;
        background: rgba(56, 189, 248, 0.16);
        color: rgba(125, 211, 252, 0.95);
      }
      .status {
        margin: 0;
        padding: 12px 14px;
        border-radius: 12px;
        font-size: 0.95rem;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(148, 163, 184, 0.25);
        display: none;
      }
      .status.visible {
        display: block;
      }
      .status.positive {
        border-color: rgba(16, 185, 129, 0.35);
        color: #bbf7d0;
      }
      .status.negative {
        border-color: rgba(239, 68, 68, 0.35);
        color: #fecaca;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        margin: 0;
        padding: 0;
        list-style: none;
        color: rgba(148, 163, 184, 0.85);
        font-size: 0.88rem;
      }
      footer {
        padding: 24px;
        text-align: center;
        font-size: 0.8rem;
        color: rgba(148, 163, 184, 0.65);
      }
      @media (max-width: 820px) {
        main {
          gap: 24px;
        }
        th:nth-child(3), td:nth-child(3) {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Operations console</h1>
      <p id="welcome-text">Review and action incoming access requests. Decisions automatically notify applicants and create accounts.</p>
      <ul class="meta" id="user-meta"></ul>
      <p id="status" class="status" role="status" aria-live="polite"></p>
    </header>
    <main>
      <section class="card">
        <h2>Pending requests <span id="pending-count" class="badge" hidden></span></h2>
        <div id="pending-container" class="empty">Loading pending requests…</div>
      </section>
      <section class="card">
        <h2>Recent decisions</h2>
        <div id="history-container" class="empty">Loading history…</div>
      </section>
    </main>
    <footer>Government Programs API · fungiagricap</footer>

    <script>
      (function () {
        const statusEl = document.getElementById('status');
        const welcomeText = document.getElementById('welcome-text');
        const userMeta = document.getElementById('user-meta');
        const pendingContainer = document.getElementById('pending-container');
        const pendingCount = document.getElementById('pending-count');
        const historyContainer = document.getElementById('history-container');

        function showStatus(message, tone) {
          statusEl.textContent = message;
          statusEl.className = 'status visible ' + (tone === 'error' ? 'negative' : 'positive');
        }

        function clearStatus() {
          statusEl.textContent = '';
          statusEl.className = 'status';
        }

        async function fetchJson(url, options) {
          const response = await fetch(url, {
            credentials: 'include',
            ...options,
          });
          if (response.status === 401) {
            window.location.href = '/account/login?next=' + encodeURIComponent(window.location.pathname);
            return null;
          }
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.error_description || payload?.error || response.statusText);
          }
          return payload;
        }

        function renderRequests(container, requests, opts = {}) {
          if (!requests || requests.length === 0) {
            container.className = 'empty';
            container.textContent = opts.emptyText || 'No entries to display.';
            return;
          }
          const table = document.createElement('table');
          const thead = document.createElement('thead');
          thead.innerHTML = '<tr><th>Requester</th><th>Justification</th><th>Apps</th><th></th></tr>';
          table.appendChild(thead);
          const tbody = document.createElement('tbody');
          requests.forEach((request) => {
            const row = document.createElement('tr');
            const apps = request.requested_apps || {};
            const appLabels = Object.keys(apps)
              .filter((key) => apps[key])
              .map((key) => key.charAt(0).toUpperCase() + key.slice(1))
              .join(', ');
            const submittedAt = new Date(request.created_at).toLocaleString();
            const cleanJustification = request.justification
              ? request.justification.replace(/</g, '&lt;')
              : '<em>No justification provided.</em>';
            row.innerHTML =
              '<td>' +
              '<div style="font-weight:600;color:#f8fafc;">' + request.display_name + '</div>' +
              '<div style="color:rgba(148,163,184,0.85);">' + request.email + '</div>' +
              '<div style="color:rgba(148,163,184,0.65);font-size:0.82rem;">Submitted ' + submittedAt + '</div>' +
              '</td>' +
              '<td>' + cleanJustification + '</td>' +
              '<td>' + (appLabels || '—') + '</td>' +
              '<td></td>';
            const actionCell = row.querySelector('td:last-child');
            if (opts.showActions) {
              const actions = document.createElement('div');
              actions.className = 'actions';
              const approve = document.createElement('button');
              approve.className = 'primary';
              approve.type = 'button';
              approve.textContent = 'Approve';
              approve.disabled = !request.decision_token;
              approve.addEventListener('click', () => handleDecision(request, 'approve'));
              const decline = document.createElement('button');
              decline.className = 'secondary';
              decline.type = 'button';
              decline.textContent = 'Decline';
              decline.disabled = !request.decision_token;
              decline.addEventListener('click', () => handleDecision(request, 'decline'));
              actions.appendChild(approve);
              actions.appendChild(decline);
              actionCell.appendChild(actions);
            } else {
              actionCell.innerHTML = '<span class="badge">' + request.status.toUpperCase() + '</span>';
            }
            tbody.appendChild(row);
          });
          table.appendChild(tbody);
          container.className = '';
          container.innerHTML = '';
          container.appendChild(table);
        }

        async function handleDecision(request, decision) {
          clearStatus();
          if (!request.decision_token) {
            showStatus('Decision token is missing for this request.', 'error');
            return;
          }
          const comment = window.prompt('Add an optional note for the applicant and audit log:', '');
          const payload = {
            token: request.decision_token,
            decision,
            reviewer_comment: comment ? comment.trim() : undefined,
          };
          try {
            await fetchJson('/v1/account/decision', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });
            showStatus('Decision recorded successfully.', 'success');
            await Promise.all([loadPending(), loadHistory()]);
          } catch (error) {
            showStatus(error.message || String(error), 'error');
          }
        }

        async function loadUser() {
          try {
            const payload = await fetchJson('/v1/auth/me');
            if (!payload) return;
            welcomeText.textContent = 'Welcome back, ' + payload.user.display_name + '.';
            userMeta.innerHTML = '';
            const emailItem = document.createElement('li');
            emailItem.textContent = payload.user.email;
            userMeta.appendChild(emailItem);
            const rolesItem = document.createElement('li');
            rolesItem.textContent = 'Roles: ' + (payload.user.roles.join(', ') || 'user');
            userMeta.appendChild(rolesItem);
          } catch (error) {
            showStatus(error.message || String(error), 'error');
          }
        }

        async function loadPending() {
          try {
            const payload = await fetchJson('/v1/operator/account-requests?status=pending');
            if (!payload) return;
            const requests = payload.data || [];
            renderRequests(pendingContainer, requests, { showActions: true, emptyText: 'No pending requests. Enjoy the calm.' });
            if (requests.length > 0) {
              pendingCount.hidden = false;
              pendingCount.textContent = requests.length + (requests.length === 1 ? ' open' : ' open');
            } else {
              pendingCount.hidden = true;
            }
          } catch (error) {
            pendingContainer.className = 'empty';
            pendingContainer.textContent = error.message || String(error);
          }
        }

        async function loadHistory() {
          try {
            const payload = await fetchJson('/v1/operator/account-requests?status=approved');
            const declined = await fetchJson('/v1/operator/account-requests?status=declined');
            const combined = [];
            if (payload?.data) combined.push(...payload.data.map((entry) => ({ ...entry, status: 'approved' })));
            if (declined?.data) combined.push(...declined.data.map((entry) => ({ ...entry, status: 'declined' })));
            combined.sort((a, b) => new Date(b.decided_at || b.created_at).getTime() - new Date(a.decided_at || a.created_at).getTime());
            renderRequests(historyContainer, combined.slice(0, 20), { emptyText: 'No recent decisions yet.' });
          } catch (error) {
            historyContainer.className = 'empty';
            historyContainer.textContent = error.message || String(error);
          }
        }

        loadUser();
        loadPending();
        loadHistory();
      })();
    </script>
  </body>
</html>`;
}
