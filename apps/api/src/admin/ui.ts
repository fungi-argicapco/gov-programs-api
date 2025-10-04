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
      <section class="card">
        <h2>Request metrics</h2>
        <div id="metrics-container" class="empty">Loading metrics…</div>
      </section>
      <section class="card">
        <h2>SLO summary</h2>
        <div id="slo-summary" class="empty">Loading service-level overview…</div>
      </section>
      <section class="card">
        <h2>Dataset health</h2>
        <div id="datasets-container" class="empty">Loading dataset snapshots…</div>
      </section>
      <section class="card">
        <h2>API keys</h2>
        <p id="keys-status" class="status" aria-live="polite"></p>
        <div id="keys-list" class="empty">Loading API keys…</div>
        <form id="key-form" style="margin-top:18px;display:grid;gap:12px;">
          <div style="display:grid;gap:6px;">
            <label for="key-name">Name (optional)</label>
            <input id="key-name" name="name" type="text" placeholder="Analytics partner" />
          </div>
          <div style="display:grid;gap:6px;">
            <label for="key-role">Role</label>
            <select id="key-role" name="role">
              <option value="read">Read</option>
              <option value="partner">Partner</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style="display:grid;gap:6px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">
            <div style="display:grid;gap:6px;">
              <label for="key-quota-daily">Daily quota</label>
              <input id="key-quota-daily" name="quota_daily" type="number" min="0" placeholder="Unlimited" />
            </div>
            <div style="display:grid;gap:6px;">
              <label for="key-quota-monthly">Monthly quota</label>
              <input id="key-quota-monthly" name="quota_monthly" type="number" min="0" placeholder="Unlimited" />
            </div>
          </div>
          <button type="submit" class="primary">Create key</button>
        </form>
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
        const metricsContainer = document.getElementById('metrics-container');
        const sloContainer = document.getElementById('slo-summary');
        const datasetsContainer = document.getElementById('datasets-container');
        const keysList = document.getElementById('keys-list');
        const keysStatus = document.getElementById('keys-status');
        const keyForm = document.getElementById('key-form');

        function showStatus(message, tone) {
          statusEl.textContent = message;
          statusEl.className = 'status visible ' + (tone === 'error' ? 'negative' : 'positive');
        }

        function clearStatus() {
          statusEl.textContent = '';
          statusEl.className = 'status';
        }

        function setKeysStatus(message, tone) {
          if (!keysStatus) return;
          if (!message) {
            keysStatus.textContent = '';
            keysStatus.className = 'status';
            return;
          }
          keysStatus.textContent = message;
          keysStatus.className = 'status visible ' + (tone === 'error' ? 'negative' : 'positive');
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

        function formatDateTime(value) {
          if (!value) return '—';
          try {
            return new Date(value).toLocaleString();
          } catch {
            return String(value);
          }
        }

        function formatNumber(value) {
          return Number.isFinite(value) ? Number(value).toLocaleString() : '—';
        }

        function renderTable(container, headers, rows) {
          if (!rows || rows.length === 0) {
            container.className = 'empty';
            container.textContent = 'No data available.';
            return;
          }
          const table = document.createElement('table');
          const thead = document.createElement('thead');
          thead.innerHTML = '<tr>' + headers.map((label) => '<th>' + label + '</th>').join('') + '</tr>';
          table.appendChild(thead);
          const tbody = document.createElement('tbody');
          rows.forEach((columns) => {
            const row = document.createElement('tr');
            row.innerHTML = columns.map((col) => '<td>' + col + '</td>').join('');
            tbody.appendChild(row);
          });
          table.appendChild(tbody);
          container.className = '';
          container.innerHTML = '';
          container.appendChild(table);
        }

        async function loadMetrics() {
          if (!metricsContainer) return;
          try {
            const payload = await fetchJson('/v1/ops/metrics?bucket=1h');
            if (!payload) return;
            const rows = (payload.data || []).slice(-25);
            renderTable(
              metricsContainer,
              ['Bucket (UTC)', 'Route', 'Status', 'Count', 'p99 (ms)'],
              rows.map((row) => [
                formatDateTime(row.bucket_ts),
                row.route,
                row.status_class,
                formatNumber(row.count),
                formatNumber(row.p99_ms)
              ])
            );
          } catch (error) {
            metricsContainer.className = 'empty';
            metricsContainer.textContent = error.message || String(error);
          }
        }

        async function loadSlo() {
          if (!sloContainer) return;
          try {
            const payload = await fetchJson('/v1/ops/slo');
            if (!payload) return;
            const rows = (payload.data || []).slice(-30);
            const summary = payload.summary || {};
            const summaryText =
              'Overall availability: ' +
              (summary.overall_availability != null ? (summary.overall_availability * 100).toFixed(2) + '%' : '—') +
              ' · Overall p99: ' +
              (summary.overall_p99 != null ? summary.overall_p99.toFixed(0) + ' ms' : '—');
            const header = document.createElement('div');
            header.textContent = summaryText;
            header.style.marginBottom = '12px';
            const wrapper = document.createElement('div');
            wrapper.className = '';
            renderTable(
              wrapper,
              ['Day', 'Route', 'Requests', 'Error rate', 'p99 (ms)', 'Budget burn'],
              rows.map((row) => [
                row.day_utc,
                row.route,
                formatNumber(row.requests),
                row.err_rate != null ? (row.err_rate * 100).toFixed(2) + '%' : '—',
                formatNumber(row.p99_ms),
                row.budget_burn != null ? (row.budget_burn * 100).toFixed(2) + '%' : '—'
              ])
            );
            sloContainer.className = '';
            sloContainer.innerHTML = '';
            sloContainer.appendChild(header);
            sloContainer.appendChild(wrapper.querySelector('table'));
          } catch (error) {
            sloContainer.className = 'empty';
            sloContainer.textContent = error.message || String(error);
          }
        }

        async function loadDatasets() {
          if (!datasetsContainer) return;
          try {
            const payload = await fetchJson('/v1/admin/datasets');
            if (!payload) return;
            const rows = payload.data || [];
            if (!rows.length) {
              datasetsContainer.className = 'empty';
              datasetsContainer.textContent = 'No datasets registered.';
              return;
            }
            const table = document.createElement('table');
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th>Dataset</th><th>Last snapshot</th><th>Services</th><th></th></tr>';
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            rows.forEach((dataset) => {
              const row = document.createElement('tr');
              const services = (dataset.services || [])
                .map((service) => (service.service_name || '') + ' (' + (service.readiness ?? 'unknown') + ')')
                .join('<br />');
              const lastSnapshot = dataset.snapshot
                ? (dataset.snapshot.version || 'v?') + ' · ' + formatDateTime(dataset.snapshot.captured_at)
                : '—';
              row.innerHTML =
                '<td><strong>' +
                dataset.name +
                '</strong><div style="color:rgba(148,163,184,0.75);font-size:0.85rem;">' +
                (dataset.id || '') +
                '</div></td>' +
                '<td>' + lastSnapshot + '</td>' +
                '<td>' + (services || '—') + '</td>' +
                '<td></td>';
              const actionCell = row.querySelector('td:last-child');
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'secondary';
              button.textContent = 'Queue reload';
              button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                  await fetchJson('/v1/admin/datasets/' + dataset.id + '/reload', { method: 'POST' });
                  showStatus('Queued reload for ' + dataset.name + '.', 'success');
                } catch (error) {
                  showStatus(error.message || String(error), 'error');
                } finally {
                  button.disabled = false;
                }
              });
              actionCell.appendChild(button);
              tbody.appendChild(row);
            });
            table.appendChild(tbody);
            datasetsContainer.className = '';
            datasetsContainer.innerHTML = '';
            datasetsContainer.appendChild(table);
          } catch (error) {
            datasetsContainer.className = 'empty';
            datasetsContainer.textContent = error.message || String(error);
          }
        }

        async function loadKeys() {
          if (!keysList) return;
          try {
            const payload = await fetchJson('/v1/admin/api-keys');
            if (!payload) return;
            const rows = payload.data || [];
            if (!rows.length) {
              keysList.className = 'empty';
              keysList.textContent = 'No API keys yet.';
              return;
            }
            const table = document.createElement('table');
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th>Name</th><th>Role</th><th>Daily</th><th>Monthly</th><th></th></tr>';
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            rows.forEach((row) => {
              const tr = document.createElement('tr');
              const nameCell = row.name ? row.name : '—';
              tr.innerHTML =
                '<td>' + nameCell + '</td>' +
                '<td>' + row.role + '</td>' +
                '<td>' + (row.quota_daily == null ? '∞' : formatNumber(row.quota_daily)) + '</td>' +
                '<td>' + (row.quota_monthly == null ? '∞' : formatNumber(row.quota_monthly)) + '</td>' +
                '<td></td>';
              const actionCell = tr.querySelector('td:last-child');
              const del = document.createElement('button');
              del.type = 'button';
              del.className = 'secondary';
              del.textContent = 'Delete';
              del.addEventListener('click', async () => {
                del.disabled = true;
                try {
                  await fetchJson('/v1/admin/api-keys/' + row.id, { method: 'DELETE' });
                  setKeysStatus('Deleted API key #' + row.id + '.', 'success');
                  await loadKeys();
                } catch (error) {
                  setKeysStatus(error.message || String(error), 'error');
                } finally {
                  del.disabled = false;
                }
              });
              actionCell.appendChild(del);
              tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            keysList.className = '';
            keysList.innerHTML = '';
            keysList.appendChild(table);
          } catch (error) {
            keysList.className = 'empty';
            keysList.textContent = error.message || String(error);
          }
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

        if (keyForm) {
          keyForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            setKeysStatus('', 'success');
            const formData = new FormData(keyForm);
            const payload = {
              name: (formData.get('name') || '').toString().trim() || null,
              role: (formData.get('role') || 'read').toString(),
              quota_daily: formData.get('quota_daily') ? Number(formData.get('quota_daily')) : null,
              quota_monthly: formData.get('quota_monthly') ? Number(formData.get('quota_monthly')) : null,
            };
            ['quota_daily', 'quota_monthly'].forEach((field) => {
              if (payload[field] !== null && !Number.isFinite(payload[field])) {
                payload[field] = null;
              }
            });
            try {
              const response = await fetchJson('/v1/admin/api-keys', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const rawKey = response?.raw_key;
              setKeysStatus(rawKey ? 'Created API key. Raw secret: ' + rawKey : 'Created API key.', 'success');
              keyForm.reset();
              await loadKeys();
            } catch (error) {
              setKeysStatus(error.message || String(error), 'error');
            }
          });
        }

        loadUser();
        loadPending();
        loadHistory();
        loadMetrics();
        loadSlo();
        loadDatasets();
        loadKeys();
      })();
    </script>
  </body>
</html>`;
}
