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
        display: flex;
        flex-direction: column;
      }
      header {
        padding: 32px clamp(24px, 4vw, 56px) 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      header h1 {
        margin: 0;
        font-size: clamp(1.6rem, 2.4vw, 2.2rem);
        color: #f8fafc;
      }
      header p {
        margin: 0;
        color: rgba(226, 232, 240, 0.76);
        max-width: 720px;
      }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      nav button {
        border: none;
        border-radius: 999px;
        padding: 10px 18px;
        font-weight: 600;
        cursor: pointer;
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(148, 163, 184, 0.35);
        color: rgba(226, 232, 240, 0.95);
        transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
      }
      nav button:hover {
        transform: translateY(-1px);
      }
      nav button.active {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.92), rgba(59, 130, 246, 0.92));
        color: #04111f;
        box-shadow: 0 12px 26px rgba(59, 130, 246, 0.3);
      }
      main {
        padding: 0 clamp(24px, 4vw, 56px) 64px;
        display: grid;
        gap: 32px;
      }
      section.view {
        display: none;
        gap: 24px;
      }
      section.view.active {
        display: grid;
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
      .panel-grid {
        display: grid;
        gap: 18px;
      }
      .panel {
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 16px;
        padding: 16px clamp(12px, 3vw, 20px);
      }
      .panel h3 {
        margin: 0 0 10px;
        font-size: 1.05rem;
        color: #f8fafc;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 10px 12px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        text-align: left;
        vertical-align: top;
        font-size: 0.94rem;
      }
      th {
        font-weight: 600;
        color: rgba(226, 232, 240, 0.94);
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
      .schema-search {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      .schema-search label {
        font-weight: 600;
      }
      .schema-search input {
        flex: 1;
        min-width: 240px;
        padding: 10px 14px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: rgba(15, 23, 42, 0.7);
        color: inherit;
        font: inherit;
      }
      .tag-list {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tag {
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(59, 130, 246, 0.18);
        color: rgba(191, 219, 254, 0.95);
        font-size: 0.78rem;
      }
      footer {
        padding: 24px;
        text-align: center;
        font-size: 0.8rem;
        color: rgba(148, 163, 184, 0.65);
        margin-top: auto;
      }
      @media (max-width: 820px) {
        main {
          gap: 24px;
        }
        nav {
          gap: 6px;
        }
        nav button {
          padding: 8px 14px;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>Operations console</h1>
        <p id="welcome-text">Review and action incoming access requests. Decisions automatically notify applicants and create accounts.</p>
        <ul class="meta" id="user-meta"></ul>
      </div>
      <nav aria-label="Operations navigation">
        <button type="button" data-view-target="requests" class="active">Requests</button>
        <button type="button" data-view-target="reports">Strategic Reports</button>
        <button type="button" data-view-target="observability">Observability</button>
        <button type="button" data-view-target="feeds">Feeds &amp; Schedules</button>
        <button type="button" data-view-target="catalog">Schema Catalog</button>
        <button type="button" data-view-target="keys">API Keys</button>
        <button type="button" data-view-target="activity">Activity</button>
      </nav>
      <p id="status" class="status" role="status" aria-live="polite"></p>
    </header>
    <main>
      <section id="view-requests" class="view active" aria-label="Access requests">
        <div class="card">
          <h2>Pending requests <span id="pending-count" class="badge" hidden></span></h2>
          <div id="pending-container" class="empty">Loading pending requests…</div>
        </div>
        <div class="card">
          <h2>Recent decisions</h2>
          <div id="history-container" class="empty">Loading history…</div>
        </div>
      </section>

      <section id="view-reports" class="view" aria-label="Strategic reports">
        <div class="card">
          <h2>Executive overview</h2>
          <div id="reports-container" class="empty">Loading strategic summaries…</div>
        </div>
      </section>

      <section id="view-observability" class="view" aria-label="Observability dashboards">
        <div class="card">
          <h2>Request metrics</h2>
          <div id="metrics-container" class="empty">Loading metrics…</div>
        </div>
        <div class="card">
          <h2>SLO summary</h2>
          <div id="slo-summary" class="empty">Loading service-level overview…</div>
        </div>
        <div class="card">
          <h2>Source health</h2>
          <div id="sources-container" class="empty">Loading source status…</div>
        </div>
        <div class="card">
          <h2>Dataset snapshots</h2>
          <div id="datasets-container" class="empty">Loading dataset snapshots…</div>
        </div>
      </section>

      <section id="view-feeds" class="view" aria-label="Feed management">
        <div class="card">
          <h2>Feeds &amp; schedules</h2>
          <p id="feeds-status" class="status" aria-live="polite"></p>
          <div id="feeds-container" class="empty">Loading dataset feeds…</div>
        </div>
      </section>

      <section id="view-catalog" class="view" aria-label="Schema catalog">
        <div class="card">
          <h2>Schema catalog</h2>
          <div class="schema-search">
            <label for="schema-search-input">Filter tables</label>
            <input id="schema-search-input" type="search" placeholder="Search tables or columns…" />
          </div>
          <div id="schema-container" class="empty">Loading schema…</div>
        </div>
      </section>

      <section id="view-keys" class="view" aria-label="API key management">
        <div class="card">
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
        </div>
      </section>

      <section id="view-activity" class="view" aria-label="Operator activity">
        <div class="card">
          <h2>Audit trail</h2>
          <div id="activity-container" class="empty">Loading audit records…</div>
        </div>
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
        const sourcesContainer = document.getElementById('sources-container');
        const datasetsContainer = document.getElementById('datasets-container');
        const feedsContainer = document.getElementById('feeds-container');
        const feedsStatus = document.getElementById('feeds-status');
        const schemaContainer = document.getElementById('schema-container');
        const schemaSearch = document.getElementById('schema-search-input');
        const keysList = document.getElementById('keys-list');
        const keysStatus = document.getElementById('keys-status');
        const keyForm = document.getElementById('key-form');
        const activityContainer = document.getElementById('activity-container');
        const reportsContainer = document.getElementById('reports-container');

        const navButtons = Array.from(document.querySelectorAll('nav button'));
        const views = {
          requests: document.getElementById('view-requests'),
          reports: document.getElementById('view-reports'),
          observability: document.getElementById('view-observability'),
          feeds: document.getElementById('view-feeds'),
          catalog: document.getElementById('view-catalog'),
          keys: document.getElementById('view-keys'),
          activity: document.getElementById('view-activity'),
        };

        const loadedViews = new Set();
        const viewLoaders = {
          requests: loadRequestsView,
          reports: loadReportsView,
          observability: loadObservabilityView,
          feeds: loadFeedsView,
          catalog: loadSchemaView,
          keys: loadKeysView,
          activity: loadActivityView,
        };

        let schemaCache = [];
        let schemaSearchInitialised = false;

        navButtons.forEach((button) => {
          button.addEventListener('click', () => {
            const target = button.getAttribute('data-view-target');
            if (target) {
              activateView(target);
            }
          });
        });

        function showStatus(message, tone) {
          if (!statusEl) return;
          statusEl.textContent = message;
          statusEl.className = 'status visible ' + (tone === 'error' ? 'negative' : 'positive');
        }

        function clearStatus() {
          if (!statusEl) return;
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

        function setFeedsStatus(message, tone) {
          if (!feedsStatus) return;
          if (!message) {
            feedsStatus.textContent = '';
            feedsStatus.className = 'status';
            return;
          }
          feedsStatus.textContent = message;
          feedsStatus.className = 'status visible ' + (tone === 'error' ? 'negative' : 'positive');
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
            const msg = payload?.error_description || payload?.error || response.statusText;
            throw new Error(msg);
          }
          return payload;
        }

        function activateView(id) {
          navButtons.forEach((button) => {
            button.classList.toggle('active', button.getAttribute('data-view-target') === id);
          });
          Object.entries(views).forEach(([key, element]) => {
            if (!element) return;
            if (key === id) {
              element.classList.add('active');
            } else {
              element.classList.remove('active');
            }
          });
          if (!loadedViews.has(id) && typeof viewLoaders[id] === 'function') {
            viewLoaders[id]().catch((error) => {
              showStatus(error instanceof Error ? error.message : String(error), 'error');
            }).finally(() => {
              loadedViews.add(id);
            });
          }
        }

        function formatDateTime(value) {
          if (value === null || value === undefined) return '—';
          const numeric = Number(value);
          if (Number.isFinite(numeric)) {
            if (numeric > 1e12) {
              return new Date(numeric).toLocaleString();
            }
            if (numeric > 1e6) {
              return new Date(numeric * 1000).toLocaleString();
            }
          }
          try {
            return new Date(value).toLocaleString();
          } catch {
            return String(value);
          }
        }

        function formatNumber(value) {
          return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '—';
        }

        function renderTable(container, headers, rows) {
          if (!container) return;
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

        async function loadUser() {
          try {
            const payload = await fetchJson('/v1/auth/me');
            if (!payload) return;
            if (welcomeText) {
              welcomeText.textContent = 'Welcome back, ' + payload.user.display_name + '.';
            }
            if (userMeta) {
              userMeta.innerHTML = '';
              const emailItem = document.createElement('li');
              emailItem.textContent = payload.user.email;
              userMeta.appendChild(emailItem);
              const rolesItem = document.createElement('li');
              rolesItem.textContent = 'Roles: ' + (payload.user.roles.join(', ') || 'user');
              userMeta.appendChild(rolesItem);
            }
          } catch (error) {
            showStatus(error instanceof Error ? error.message : String(error), 'error');
          }
        }

        async function loadRequestsView() {
          await Promise.all([loadPendingRequests(), loadDecisionHistory()]);
        }

        async function loadReportsView() {
          await loadStrategicReports();
        }

        async function loadObservabilityView() {
          await Promise.all([loadMetrics(), loadSlo(), loadSourcesHealth(), loadDatasetSummary()]);
        }

        async function loadFeedsView() {
          await loadFeeds();
        }

        async function loadSchemaView() {
          if (!schemaSearchInitialised && schemaSearch) {
            schemaSearchInitialised = true;
            schemaSearch.addEventListener('input', () => {
              const term = schemaSearch.value.trim().toLowerCase();
              if (!term) {
                renderSchema(schemaCache);
                return;
              }
              const filtered = schemaCache.filter((table) => {
                if (table.name.toLowerCase().includes(term)) return true;
                return table.columns.some((col) => col.name.toLowerCase().includes(term));
              });
              renderSchema(filtered);
            });
          }
          if (schemaCache.length === 0) {
            try {
              const payload = await fetchJson('/v1/operator/schema');
              if (!payload) return;
              schemaCache = payload.data || [];
              renderSchema(schemaCache);
            } catch (error) {
              if (schemaContainer) {
                schemaContainer.className = 'empty';
                schemaContainer.textContent = (error instanceof Error ? error.message : String(error));
              }
            }
          } else {
            renderSchema(schemaCache);
          }
        }

        async function loadKeysView() {
          await loadKeys();
        }

        async function loadActivityView() {
          await loadActivity();
        }

        async function loadPendingRequests() {
          if (!pendingContainer) return;
          try {
            const payload = await fetchJson('/v1/operator/account-requests?status=pending');
            if (!payload) return;
            const requests = payload.data || [];
            renderRequests(pendingContainer, requests, { showActions: true, emptyText: 'No pending requests. Enjoy the calm.' });
            if (pendingCount) {
              if (requests.length > 0) {
                pendingCount.hidden = false;
                pendingCount.textContent = requests.length + (requests.length === 1 ? ' open' : ' open');
              } else {
                pendingCount.hidden = true;
              }
            }
          } catch (error) {
            pendingContainer.className = 'empty';
            pendingContainer.textContent = error instanceof Error ? error.message : String(error);
          }
        }

        async function loadDecisionHistory() {
          if (!historyContainer) return;
          try {
            const [approved, declined] = await Promise.all([
              fetchJson('/v1/operator/account-requests?status=approved'),
              fetchJson('/v1/operator/account-requests?status=declined')
            ]);
            const combined = [];
            if (approved?.data) combined.push(...approved.data.map((entry) => ({ ...entry, status: 'approved' })));
            if (declined?.data) combined.push(...declined.data.map((entry) => ({ ...entry, status: 'declined' })));
            combined.sort((a, b) => {
              const left = new Date(a.decided_at || a.created_at).getTime();
              const right = new Date(b.decided_at || b.created_at).getTime();
              return right - left;
            });
            renderRequests(historyContainer, combined.slice(0, 20), { emptyText: 'No recent decisions yet.' });
          } catch (error) {
            historyContainer.className = 'empty';
            historyContainer.textContent = error instanceof Error ? error.message : String(error);
          }
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
            metricsContainer.textContent = error instanceof Error ? error.message : String(error);
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
              (summary.overall_p99 != null ? Number(summary.overall_p99).toFixed(0) + ' ms' : '—');
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
            sloContainer.textContent = error instanceof Error ? error.message : String(error);
          }
        }

        async function loadSourcesHealth() {
          if (!sourcesContainer) return;
          try {
            const payload = await fetchJson('/v1/admin/sources/health');
            if (!payload) return;
            const rows = payload.data || [];
            renderTable(
              sourcesContainer,
              ['Source', 'Jurisdiction', 'Last success', 'Success rate (7d)', 'Last error'],
              rows.map((row) => [
                row.name,
                row.jurisdiction_code,
                formatDateTime(row.last_success_at),
                row.success_rate_7d != null ? (row.success_rate_7d * 100).toFixed(1) + '%' : '—',
                row.last_error || 'None'
              ])
            );
          } catch (error) {
            sourcesContainer.className = 'empty';
            sourcesContainer.textContent = error instanceof Error ? error.message : String(error);
          }
        }

        async function loadDatasetSummary() {
          if (!datasetsContainer) return;
          try {
            const payload = await fetchJson('/v1/operator/feeds?history=1');
            if (!payload) return;
            const rows = payload.data || [];
            if (rows.length === 0) {
              datasetsContainer.className = 'empty';
              datasetsContainer.textContent = 'No datasets registered.';
              return;
            }
            const panels = document.createElement('div');
            panels.className = 'panel-grid';
            rows.forEach((dataset) => {
              const panel = document.createElement('div');
              panel.className = 'panel';
              panel.innerHTML =
                '<h3>' + dataset.label + '</h3>' +
                '<p style="margin:0 0 6px;color:rgba(148,163,184,0.85);">' + dataset.id + '</p>' +
                '<p style="margin:0;">Target version: <strong>' + dataset.targetVersion + '</strong></p>' +
                '<p style="margin:6px 0 0;">Latest snapshot: ' +
                (dataset.latestSnapshot ? formatDateTime(dataset.latestSnapshot.capturedAt) + ' (v' + dataset.latestSnapshot.version + ')' : '—') +
                '</p>';
              panels.appendChild(panel);
            });
            datasetsContainer.className = '';
            datasetsContainer.innerHTML = '';
            datasetsContainer.appendChild(panels);
          } catch (error) {
            datasetsContainer.className = 'empty';
            datasetsContainer.textContent = error instanceof Error ? error.message : String(error);
          }
        }

        function renderRequests(container, requests, opts) {
          const options = opts || {};
          if (!container) return;
          if (!requests || requests.length === 0) {
            container.className = 'empty';
            container.textContent = options.emptyText || 'No entries to display.';
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
            const submittedAt = formatDateTime(request.created_at);
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
            if (options.showActions) {
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
              actionCell.innerHTML = '<span class="badge">' + (request.status || '').toUpperCase() + '</span>';
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
            showStatus('Decision recorded successfully.', 'positive');
            await Promise.all([loadPendingRequests(), loadDecisionHistory()]);
          } catch (error) {
            showStatus(error instanceof Error ? error.message : String(error), 'error');
          }
        }

        async function loadFeeds() {
          if (!feedsContainer) return;
          try {
            const payload = await fetchJson('/v1/operator/feeds?history=5');
            if (!payload) return;
            const feeds = payload.data || [];
            if (feeds.length === 0) {
              feedsContainer.className = 'empty';
              feedsContainer.textContent = 'No datasets registered.';
              return;
            }
            const list = document.createElement('div');
            list.className = 'panel-grid';
            feeds.forEach((feed) => {
              const panel = document.createElement('div');
              panel.className = 'panel';
              const historyItems = (feed.history || []).map((entry) => '<li>' + formatDateTime(entry.capturedAt) + ' · v' + entry.version + '</li>').join('');
              const services = (feed.services || []).map((service) => '<li><strong>' + service.serviceName + '</strong> · ' + service.endpoint + (service.cadence ? ' · ' + service.cadence : '') + '</li>').join('');
              panel.innerHTML =
                '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;">
                   <div>
                     <h3 style="margin:0 0 4px;">' + feed.label + '</h3>
                     <p style="margin:0;color:rgba(148,163,184,0.8);">' + feed.id + '</p>
                   </div>
                   <button type="button" class="secondary" data-feed-id="' + feed.id + '">Reload</button>
                 </div>' +
                '<p style="margin:12px 0 0;">Target version: <strong>' + feed.targetVersion + '</strong></p>' +
                '<p style="margin:4px 0 0;">Latest snapshot: ' + (feed.latestSnapshot ? formatDateTime(feed.latestSnapshot.capturedAt) + ' (v' + feed.latestSnapshot.version + ')' : '—') + '</p>' +
                '<p style="margin:4px 0 0;">Total snapshots: ' + formatNumber(feed.totalSnapshots) + '</p>' +
                '<div style="margin-top:12px;">
                   <h4 style="margin:0 0 6px;font-size:0.9rem;color:rgba(226,232,240,0.9);">Recent history</h4>
                   <ul style="margin:0;padding-left:18px;color:rgba(148,163,184,0.85);">' + (historyItems || '<li>No snapshots yet.</li>') + '</ul>
                 </div>' +
                '<div style="margin-top:12px;">
                   <h4 style="margin:0 0 6px;font-size:0.9rem;color:rgba(226,232,240,0.9);">Services</h4>
                   <ul style="margin:0;padding-left:18px;color:rgba(148,163,184,0.85);">' + (services || '<li>No services documented.</li>') + '</ul>
                 </div>';
              const reloadButton = panel.querySelector('button[data-feed-id="' + feed.id + '"]');
              if (reloadButton) {
                reloadButton.addEventListener('click', async () => {
                  reloadButton.disabled = true;
                  setFeedsStatus('Triggering ingest for ' + feed.id + '…', 'positive');
                  try {
                    await fetchJson('/v1/operator/feeds/' + feed.id + '/trigger', { method: 'POST' });
                    setFeedsStatus('Ingest triggered for ' + feed.id + '. Check history for updates.', 'positive');
                    await loadFeeds();
                  } catch (error) {
                    setFeedsStatus(error instanceof Error ? error.message : String(error), 'error');
                  } finally {
                    reloadButton.disabled = false;
                  }
                });
              }
              list.appendChild(panel);
            });
            feedsContainer.className = '';
            feedsContainer.innerHTML = '';
            feedsContainer.appendChild(list);
          } catch (error) {
            feedsContainer.className = 'empty';
            feedsContainer.textContent = error instanceof Error ? error.message : String(error);
          }
        }

        function renderSchema(tables) {
          if (!schemaContainer) return;
          if (!tables || tables.length === 0) {
            schemaContainer.className = 'empty';
            schemaContainer.textContent = 'No tables found for this filter.';
            return;
          }
          const list = document.createElement('div');
          list.className = 'panel-grid';
          tables.forEach((table) => {
            const panel = document.createElement('div');
            panel.className = 'panel';
            const columns = table.columns || [];
            const colRows = columns.map((col) => [
              col.name,
              col.type || '—',
              col.primary_key ? 'PK' : '',
              col.nullable ? 'NULL' : 'NOT NULL',
              col.default || '—'
            ]);
            panel.innerHTML =
              '<h3>' + table.name + '</h3>' +
              '<p style="margin:0 0 8px;color:rgba(148,163,184,0.8);">Rows: ' + formatNumber(table.row_count) + '</p>';
            const tableEl = document.createElement('table');
            const head = document.createElement('thead');
            head.innerHTML = '<tr><th>Name</th><th>Type</th><th></th><th>Nullability</th><th>Default</th></tr>';
            tableEl.appendChild(head);
            const body = document.createElement('tbody');
            colRows.forEach((values) => {
              const row = document.createElement('tr');
              row.innerHTML = values.map((value) => '<td>' + value + '</td>').join('');
              body.appendChild(row);
            });
            tableEl.appendChild(body);
            panel.appendChild(tableEl);
            list.appendChild(panel);
          });
          schemaContainer.className = '';
          schemaContainer.innerHTML = '';
          schemaContainer.appendChild(list);
        }

        async function loadKeys() {
          if (!keysList) return;
          try {
            const payload = await fetchJson('/v1/admin/api-keys');
            if (!payload) return;
            const rows = payload.data || [];
            if (rows.length === 0) {
              keysList.className = 'empty';
              keysList.textContent = 'No API keys have been created yet.';
              return;
            }
            const table = document.createElement('table');
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th>Name</th><th>Role</th><th>Daily</th><th>Monthly</th><th>Last seen</th><th></th></tr>';
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            rows.forEach((row) => {
              const tr = document.createElement('tr');
              tr.innerHTML =
                '<td>' + (row.name || '—') + '</td>' +
                '<td>' + row.role + '</td>' +
                '<td>' + (row.quota_daily == null ? '∞' : formatNumber(row.quota_daily)) + '</td>' +
                '<td>' + (row.quota_monthly == null ? '∞' : formatNumber(row.quota_monthly)) + '</td>' +
                '<td>' + (row.last_seen_at ? formatDateTime(row.last_seen_at * 1000) : '—') + '</td>' +
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
                  setKeysStatus('Deleted API key #' + row.id + '.', 'positive');
                  await loadKeys();
                } catch (error) {
                  setKeysStatus(error instanceof Error ? error.message : String(error), 'error');
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
            keysList.textContent = error instanceof Error ? error.message : String(error);
          }
        }

        async function loadActivity() {
          if (!activityContainer) return;
          try {
            const payload = await fetchJson('/v1/operator/audits');
            if (!payload) return;
            const rows = payload.data || [];
            if (rows.length === 0) {
              activityContainer.className = 'empty';
              activityContainer.textContent = 'No recent actions yet.';
              return;
            }
            renderTable(
              activityContainer,
              ['Timestamp', 'Action', 'Target', 'Meta'],
              rows.slice(0, 100).map((row) => [
                formatDateTime(row.ts * 1000),
                row.action,
                row.target || '—',
                row.meta ? '<code>' + JSON.stringify(row.meta) + '</code>' : '—'
              ])
            );
          } catch (error) {
            activityContainer.className = 'empty';
            activityContainer.textContent = error instanceof Error ? error.message : String(error);
          }
        }

        async function loadStrategicReports() {
          if (!reportsContainer) return;
          try {
            const payload = await fetchJson('/v1/operator/reports');
            if (!payload) return;
            const data = payload.data || {};
            const pestle = data.pestle || {};
            const panel = document.createElement('div');
            panel.className = 'panel-grid';

            const programsPanel = document.createElement('div');
            programsPanel.className = 'panel';
            const byStatus = (data.programs?.by_status || []).map((item) => '<li>' + item.status + ': ' + formatNumber(item.count) + '</li>').join('');
            const byAuthority = (data.programs?.by_authority || []).map((item) => '<li>' + item.authority + ': ' + formatNumber(item.count) + '</li>').join('');
            programsPanel.innerHTML =
              '<h3>Government programs</h3>' +
              '<p style="margin:0 0 6px;">Total programs: <strong>' + formatNumber(data.programs?.total) + '</strong></p>' +
              '<p style="margin:0 0 12px;">Upcoming or open: <strong>' + formatNumber(data.programs?.upcoming) + '</strong></p>' +
              '<div style="display:grid;gap:8px;">
                 <div>
                   <h4 style="margin:0 0 4px;font-size:0.9rem;color:rgba(226,232,240,0.9);">By status</h4>
                   <ul style="margin:0;padding-left:18px;color:rgba(148,163,184,0.85);">' + (byStatus || '<li>No data</li>') + '</ul>
                 </div>
                 <div>
                   <h4 style="margin:0 0 4px;font-size:0.9rem;color:rgba(226,232,240,0.9);">By authority level</h4>
                   <ul style="margin:0;padding-left:18px;color:rgba(148,163,184,0.85);">' + (byAuthority || '<li>No data</li>') + '</ul>
                 </div>
               </div>';
            panel.appendChild(programsPanel);

            const macroPanel = document.createElement('div');
            macroPanel.className = 'panel';
            const macroGroups = (data.macro?.groups || []).map((item) => '<li>' + item.group + ': ' + formatNumber(item.count) + '</li>').join('');
            macroPanel.innerHTML =
              '<h3>Economic indicators</h3>' +
              '<p style="margin:0 0 6px;">Metrics captured: <strong>' + formatNumber(data.macro?.total_metrics) + '</strong></p>' +
              '<h4 style="margin:12px 0 4px;font-size:0.9rem;color:rgba(226,232,240,0.9);">Metrics by group</h4>
               <ul style="margin:0;padding-left:18px;color:rgba(148,163,184,0.85);">' + (macroGroups || '<li>No data</li>') + '</ul>';
            panel.appendChild(macroPanel);

            const climatePanel = document.createElement('div');
            climatePanel.className = 'panel';
            const climateDatasets = (data.climate?.datasets || []).map((item) => '<li>' + item.dataset + ': ' + formatNumber(item.count) + '</li>').join('');
            climatePanel.innerHTML =
              '<h3>Climate & ESG coverage</h3>' +
              '<p style="margin:0 0 6px;">Indicators tracked: <strong>' + formatNumber(data.climate?.total_indicators) + '</strong></p>' +
              '<h4 style="margin:12px 0 4px;font-size:0.9rem;color:rgba(226,232,240,0.9);">Datasets</h4>
               <ul style="margin:0;padding-left:18px;color:rgba(148,163,184,0.85);">' + (climateDatasets || '<li>No data</li>') + '</ul>';
            panel.appendChild(climatePanel);

            const capitalPanel = document.createElement('div');
            capitalPanel.className = 'panel';
            const capitalScenarios = (data.capital?.scenarios || []).map((item) => '<li>' + item.scenario + ': ' + formatNumber(item.count) + '</li>').join('');
            capitalPanel.innerHTML =
              '<h3>Capital stack partners</h3>' +
              '<p style="margin:0 0 6px;">Entries tracked: <strong>' + formatNumber(data.capital?.total_entries) + '</strong></p>' +
              '<h4 style="margin:12px 0 4px;font-size:0.9rem;color:rgba(226,232,240,0.9);">Scenarios</h4>
               <ul style="margin:0;padding-left:18px;color:rgba(148,163,184,0.85);">' + (capitalScenarios || '<li>No data</li>') + '</ul>';
            panel.appendChild(capitalPanel);

            const playbooksPanel = document.createElement('div');
            playbooksPanel.className = 'panel';
            const playbookList = (data.playbooks || []).slice(0, 10).map((entry) => '<li>' + entry.country + (entry.updated_at ? ' · ' + formatDateTime(entry.updated_at) : '') + '</li>').join('');
            playbooksPanel.innerHTML =
              '<h3>Country playbooks</h3>' +
              '<p style="margin:0 0 6px;">Active playbooks: <strong>' + formatNumber((data.playbooks || []).length) + '</strong></p>' +
              '<h4 style="margin:12px 0 4px;font-size:0.9rem;color:rgba(226,232,240,0.9);">Recent updates</h4>
               <ul style="margin:0;padding-left:18px;color:rgba(148,163,184,0.85);">' + (playbookList || '<li>No playbooks published yet.</li>') + '</ul>';
            panel.appendChild(playbooksPanel);

            const pestlePanel = document.createElement('div');
            pestlePanel.className = 'panel';
            pestlePanel.innerHTML =
              '<h3>PESTLE snapshot</h3>' +
              '<div style="display:grid;gap:10px;">' +
              Object.entries(pestle).map(([key, value]) => {
                const label = key.charAt(0).toUpperCase() + key.slice(1);
                const items = [];
                if (value && typeof value === 'object') {
                  Object.entries(value).forEach(([subKey, subValue]) => {
                    if (Array.isArray(subValue)) {
                      subValue.forEach((entry) => {
                        if (entry && typeof entry === 'object') {
                          const entryLabel = Object.entries(entry)
                            .map(([k, v]) => {
                              if (typeof v === 'number') {
                                return k + ': ' + formatNumber(v);
                              }
                              return k + ': ' + String(v);
                            })
                            .join(', ');
                          items.push(entryLabel);
                        }
                      });
                    } else {
                      if (typeof subValue === 'number') {
                        items.push(subKey.replace(/_/g, ' ') + ': ' + formatNumber(subValue));
                      } else {
                        items.push(subKey.replace(/_/g, ' ') + ': ' + String(subValue));
                      }
                    }
                  });
                }
                return (
                  '<div>' +
                  '<strong style="display:block;margin-bottom:4px;">' + label + '</strong>' +
                  '<ul style="margin:0;padding-left:18px;color:rgba(148,163,184,0.85);">' + (items.length ? items.map((text) => '<li>' + text + '</li>').join('') : '<li>No data</li>') + '</ul>' +
                  '</div>'
                );
              }).join('') +
              '</div>';
            panel.appendChild(pestlePanel);

            reportsContainer.className = '';
            reportsContainer.innerHTML = '';
            reportsContainer.appendChild(panel);
          } catch (error) {
            reportsContainer.className = 'empty';
            reportsContainer.textContent = error instanceof Error ? error.message : String(error);
          }
        }

        if (keyForm) {
          keyForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            setKeysStatus('', 'positive');
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
              setKeysStatus(rawKey ? 'Created API key. Raw secret: ' + rawKey : 'Created API key.', 'positive');
              keyForm.reset();
              await loadKeys();
            } catch (error) {
              setKeysStatus(error instanceof Error ? error.message : String(error), 'error');
            }
          });
        }

        loadUser();
        activateView('requests');
      })();
    </script>
  </body>
</html>`;
}
