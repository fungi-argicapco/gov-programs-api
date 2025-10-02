import type { Context } from 'hono';
import type { Env } from '../db';
import type { AuthVariables } from '../mw.auth';

export function adminUi(_c: Context<{ Bindings: Env; Variables: AuthVariables }>): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Gov Programs Admin Console</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      body {
        margin: 0;
        padding: 24px;
        background: #0f172a;
        color: #e2e8f0;
      }
      h1, h2, h3 {
        margin: 0 0 12px;
      }
      section {
        background: rgba(15, 23, 42, 0.85);
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 20px;
        box-shadow: 0 10px 35px rgba(15, 23, 42, 0.3);
      }
      label {
        display: block;
        margin-bottom: 8px;
      }
      input, select, button {
        font: inherit;
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid rgba(148, 163, 184, 0.3);
        background: rgba(15, 23, 42, 0.6);
        color: inherit;
      }
      button {
        cursor: pointer;
        background: rgba(56, 189, 248, 0.15);
        border-color: rgba(56, 189, 248, 0.3);
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 8px 10px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        text-align: left;
        font-size: 14px;
      }
      #metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .metric-card {
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 10px;
        padding: 12px;
        background: rgba(15, 23, 42, 0.8);
      }
      .metric-card canvas {
        width: 100%;
        height: 60px;
        display: block;
        border-radius: 6px;
        background: rgba(15, 23, 42, 0.6);
      }
      #api-keys-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 12px;
      }
      .key-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(15, 23, 42, 0.6);
        font-size: 14px;
      }
      .key-row button {
        margin-left: 12px;
      }
      #status-banner {
        margin-top: 8px;
        min-height: 20px;
        font-size: 13px;
        color: rgba(56, 189, 248, 0.9);
      }
      #slo-summary {
        margin-top: 12px;
        font-size: 14px;
        color: rgba(248, 250, 252, 0.85);
      }
      a {
        color: rgba(125, 211, 252, 0.9);
      }
    </style>
  </head>
  <body>
    <h1>Operator Console</h1>
    <section id="auth-section">
      <h2>API Access</h2>
      <label for="admin-key-input">Admin API Key</label>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <input id="admin-key-input" type="password" placeholder="Paste admin key" style="flex:1; min-width:220px;" />
        <button id="save-admin-key" type="button">Save</button>
        <button id="clear-admin-key" type="button">Clear</button>
      </div>
      <div id="status-banner" aria-live="polite"></div>
    </section>

    <section id="metrics-section">
      <h2>Hourly Metrics</h2>
      <p>Latency and error rate per route from <code>/v1/ops/metrics?bucket=1h</code>.</p>
      <div id="metrics-grid"></div>
    </section>

    <section id="slo-section">
      <h2>SLO Windows</h2>
      <table id="slo-table">
        <thead>
          <tr>
            <th>Day (UTC)</th>
            <th>Route</th>
            <th>Requests</th>
            <th>Error Rate</th>
            <th>P99 (ms)</th>
            <th>SLO OK</th>
            <th>Budget Burn</th>
          </tr>
        </thead>
        <tbody id="slo-table-body"></tbody>
      </table>
      <div id="slo-summary"></div>
    </section>

    <section id="keys-section">
      <h2>API Keys</h2>
      <form id="create-key-form">
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <input id="key-name" name="name" type="text" placeholder="Name" />
          <select id="key-role" name="role">
            <option value="read">read</option>
            <option value="partner">partner</option>
            <option value="admin">admin</option>
          </select>
          <input id="key-quota-daily" name="quota_daily" type="number" min="0" placeholder="Daily quota" />
          <input id="key-quota-monthly" name="quota_monthly" type="number" min="0" placeholder="Monthly quota" />
          <button type="submit">Create Key</button>
        </div>
      </form>
      <div id="api-keys-list"></div>
    </section>

    <section id="datasets-section">
      <h2>Datasets & Feeds</h2>
      <p>Managed research datasets, capital stacks, and roadmap feeds with snapshot history.</p>
      <div id="datasets-list"></div>
    </section>

    <script>
      (function () {
        const STORAGE_KEY = 'opsAdminKey';
        const keyInput = document.getElementById('admin-key-input');
        const status = document.getElementById('status-banner');
        const metricsGrid = document.getElementById('metrics-grid');
        const sloTableBody = document.getElementById('slo-table-body');
        const sloSummary = document.getElementById('slo-summary');
        const keysList = document.getElementById('api-keys-list');
        const createForm = document.getElementById('create-key-form');
        const datasetsList = document.getElementById('datasets-list');

        function getStoredKey() {
          try {
            return window.localStorage.getItem(STORAGE_KEY) || '';
          } catch (err) {
            console.warn('localStorage unavailable', err);
            return '';
          }
        }

        function setStoredKey(value) {
          try {
            if (value) {
              window.localStorage.setItem(STORAGE_KEY, value);
            } else {
              window.localStorage.removeItem(STORAGE_KEY);
            }
          } catch (err) {
            console.warn('localStorage unavailable', err);
          }
        }

        keyInput.value = getStoredKey();

        function showStatus(message, isError) {
          status.textContent = message || '';
          status.style.color = isError ? 'rgba(248, 113, 113, 0.9)' : 'rgba(56, 189, 248, 0.9)';
        }

        async function authedFetch(url, options) {
          const key = getStoredKey();
          if (!key) {
            throw new Error('Set an admin API key to load data.');
          }
          const init = options ? { ...options } : {};
          const headers = new Headers(init.headers || {});
          headers.set('x-api-key', key);
          if (init.body && !headers.has('content-type')) {
            headers.set('content-type', 'application/json');
          }
          init.headers = headers;
          const response = await fetch(url, init);
          if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error('Request failed: ' + response.status + ' ' + text);
          }
          return response;
        }

        function drawLine(canvas, values, color, maxValue) {
          const ctx = canvas.getContext('2d');
          const width = canvas.width;
          const height = canvas.height;
          ctx.clearRect(0, 0, width, height);
          if (!values.length) {
            ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
            ctx.font = '12px system-ui';
            ctx.fillText('no data', 6, height / 2);
            return;
          }
          const usableHeight = height - 4;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          values.forEach((value, idx) => {
            const x = values.length > 1 ? (idx * (width - 2)) / (values.length - 1) + 1 : width / 2;
            const ratio = maxValue > 0 ? value / maxValue : 0;
            const y = height - ratio * usableHeight - 2;
            if (idx === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.stroke();
        }

        async function loadMetrics() {
          metricsGrid.innerHTML = '<p>Loading metrics…</p>';
          try {
            const response = await authedFetch('/v1/ops/metrics?bucket=1h');
            const payload = await response.json();
            const data = payload.data || [];
            const byRoute = new Map();
            data.forEach((row) => {
              const route = row.route;
              if (!byRoute.has(route)) {
                byRoute.set(route, new Map());
              }
              const bucket = row.bucket_ts;
              const routeBuckets = byRoute.get(route);
              if (!routeBuckets.has(bucket)) {
                routeBuckets.set(bucket, { count: 0, p99: 0, error: 0, weight: 0 });
              }
              const bucketInfo = routeBuckets.get(bucket);
              const count = Number(row.count || 0);
              bucketInfo.count += count;
              bucketInfo.weight += Number(row.p99_ms || 0) * count;
              if (row.status_class === '4xx' || row.status_class === '5xx') {
                bucketInfo.error += count;
              }
            });

            const fragments = document.createDocumentFragment();
            byRoute.forEach((buckets, route) => {
              const sorted = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
              const p99Values = sorted.map(([, info]) => (info.count > 0 ? info.weight / info.count : 0));
              const errorValues = sorted.map(([, info]) => (info.count > 0 ? info.error / info.count : 0));

              const card = document.createElement('div');
              card.className = 'metric-card';
              const title = document.createElement('h3');
              title.textContent = route;
              card.appendChild(title);

              const latencyCanvas = document.createElement('canvas');
              latencyCanvas.width = 220;
              latencyCanvas.height = 60;
              latencyCanvas.title = 'P99 latency';
              drawLine(latencyCanvas, p99Values, 'rgba(96, 165, 250, 0.9)', Math.max(...p99Values, 1));

              const errorCanvas = document.createElement('canvas');
              errorCanvas.width = 220;
              errorCanvas.height = 60;
              errorCanvas.title = 'Error rate';
              drawLine(errorCanvas, errorValues, 'rgba(248, 113, 113, 0.85)', 1);

              const latencyLabel = document.createElement('div');
              latencyLabel.textContent = 'P99 (ms)';
              latencyLabel.style.fontSize = '12px';
              latencyLabel.style.marginTop = '4px';

              const errorLabel = document.createElement('div');
              errorLabel.textContent = 'Error rate';
              errorLabel.style.fontSize = '12px';
              errorLabel.style.marginTop = '4px';

              card.appendChild(latencyCanvas);
              card.appendChild(latencyLabel);
              card.appendChild(errorCanvas);
              card.appendChild(errorLabel);

              fragments.appendChild(card);
            });

            metricsGrid.innerHTML = '';
            metricsGrid.appendChild(fragments);
            if (!byRoute.size) {
              metricsGrid.innerHTML = '<p>No metrics yet.</p>';
            }
          } catch (err) {
            metricsGrid.innerHTML = '<p>Failed to load metrics.</p>';
            showStatus(err.message || String(err), true);
          }
        }

        function formatPercent(value) {
          return (value * 100).toFixed(2) + '%';
        }

        function formatIso(timestamp) {
          if (!timestamp) return '—';
          try {
            const date = new Date(timestamp);
            if (Number.isNaN(date.valueOf())) return '—';
            return date.toISOString();
          } catch (err) {
            return String(timestamp);
          }
        }

        async function loadSlo() {
          sloTableBody.innerHTML = '<tr><td colspan="7">Loading…</td></tr>';
          try {
            const response = await authedFetch('/v1/ops/slo');
            const payload = await response.json();
            const rows = payload.data || [];
            const summary = payload.summary || {};

            sloTableBody.innerHTML = '';
            rows.forEach((row) => {
              const tr = document.createElement('tr');
              const cells = [
                row.day_utc,
                row.route,
                String(row.requests ?? ''),
                formatPercent(Number(row.err_rate || 0)),
                Number(row.p99_ms || 0).toFixed(1),
                row.slo_ok ? '✅' : '⚠️',
                row.budget_burn == null ? '—' : formatPercent(Number(row.budget_burn))
              ];
              tr.innerHTML = cells.map((value) => '<td>' + value + '</td>').join('');
              sloTableBody.appendChild(tr);
            });
            if (!rows.length) {
              const empty = document.createElement('tr');
              empty.innerHTML = '<td colspan="7">No SLO data available.</td>';
              sloTableBody.appendChild(empty);
            }

            const routes = summary.routes || [];
            const availability = Number(summary.overall_availability || 0);
            const p99 = Number(summary.overall_p99 || 0);
            const routeText = routes
              .map(
                (route) =>
                  route.route +
                  ': ' +
                  formatPercent(route.availability) +
                  ' / ' +
                  Number(route.p99_ms || 0).toFixed(1) +
                  'ms'
              )
              .join(' • ');
            sloSummary.textContent =
              'Overall availability ' +
              formatPercent(availability) +
              ' · Overall P99 ' +
              p99.toFixed(1) +
              'ms' +
              (routeText ? ' · ' + routeText : '');
          } catch (err) {
            sloTableBody.innerHTML = '<tr><td colspan="7">Failed to load SLO data.</td></tr>';
            showStatus(err.message || String(err), true);
          }
        }

        async function loadDatasets() {
          datasetsList.innerHTML = '<p>Loading datasets…</p>';
          try {
            const response = await authedFetch('/v1/admin/datasets');
            const payload = await response.json();
            const datasets = payload.data || [];
            if (!datasets.length) {
              datasetsList.innerHTML = '<p>No datasets available.</p>';
              return;
            }

            const fragment = document.createDocumentFragment();
            datasets.forEach((dataset) => {
              const card = document.createElement('div');
              card.className = 'metric-card';
              card.style.marginBottom = '12px';

              const heading = document.createElement('h3');
              heading.textContent = dataset.label;
              card.appendChild(heading);

              const meta = document.createElement('p');
              const targetVersion = dataset.targetVersion || 'unknown';
              const latest = dataset.latestSnapshot;
              const capturedAt = latest ? formatIso(latest.capturedAt) : 'never';
              const versionStatus = latest && latest.version !== targetVersion ? '⚠️ version mismatch' : '';
              meta.innerHTML =
                '<strong>ID:</strong> ' +
                dataset.id +
                '<br/><strong>Target version:</strong> ' +
                targetVersion +
                '<br/><strong>Latest snapshot:</strong> ' +
                (latest ? latest.version : 'none') +
                ' · ' +
                capturedAt +
                (versionStatus ? ' <span style="color: rgba(248, 113, 113, 0.9);">' + versionStatus + '</span>' : '');
              card.appendChild(meta);

              const reload = document.createElement('button');
              reload.type = 'button';
              reload.textContent = 'Reload dataset';
              reload.addEventListener('click', async () => {
                try {
                  showStatus('Reloading ' + dataset.id + '…', false);
                  const response = await authedFetch('/v1/admin/datasets/' + dataset.id + '/reload', { method: 'POST' });
                  const result = await response.json();
                  showStatus('Reloaded ' + dataset.id + ' v' + result.data.version, false);
                  await loadDatasets();
                } catch (err) {
                  showStatus(err.message || String(err), true);
                }
              });
              card.appendChild(reload);

              if (dataset.services && dataset.services.length) {
                const list = document.createElement('ul');
                list.style.marginTop = '12px';
                dataset.services.forEach((service) => {
                  const item = document.createElement('li');
                  const readiness = service.readiness ? ' · ' + service.readiness : '';
                  const statusPage = service.statusPage ? ' · <a href="' + service.statusPage + '" target="_blank" rel="noopener">status</a>' : '';
                  item.innerHTML =
                    '<strong>' +
                    service.serviceName +
                    '</strong>: ' +
                    service.endpoint +
                    readiness +
                    (service.rateLimit ? ' · ' + service.rateLimit : '') +
                    (service.cadence ? ' · ' + service.cadence : '') +
                    statusPage;
                  list.appendChild(item);
                });
                card.appendChild(list);
              }

              fragment.appendChild(card);
            });

            datasetsList.innerHTML = '';
            datasetsList.appendChild(fragment);
          } catch (err) {
            datasetsList.innerHTML = '<p>Failed to load datasets.</p>';
            showStatus(err.message || String(err), true);
          }
        }

        async function loadKeys() {
          keysList.innerHTML = '<p>Loading keys…</p>';
          try {
            const response = await authedFetch('/v1/admin/api-keys');
            const payload = await response.json();
            const keys = payload.data || [];
            keysList.innerHTML = '';
            keys.forEach((key) => {
              const row = document.createElement('div');
              row.className = 'key-row';
              const info = document.createElement('div');
              const nameLabel = key.name || '(unnamed)';
              const dailyLimit = key.quota_daily == null ? '∞' : key.quota_daily;
              const monthlyLimit = key.quota_monthly == null ? '∞' : key.quota_monthly;
              info.innerHTML =
                '<strong>' +
                nameLabel +
                '</strong><div>Role: ' +
                key.role +
                '</div><div>Daily: ' +
                dailyLimit +
                ' · Monthly: ' +
                monthlyLimit +
                '</div>';
              const actions = document.createElement('div');
              const del = document.createElement('button');
              del.type = 'button';
              del.textContent = 'Delete';
              del.addEventListener('click', async () => {
                try {
                  await authedFetch('/v1/admin/api-keys/' + key.id, { method: 'DELETE' });
                  showStatus('Deleted key #' + key.id, false);
                  await loadKeys();
                } catch (err) {
                  showStatus(err.message || String(err), true);
                }
              });
              actions.appendChild(del);
              row.appendChild(info);
              row.appendChild(actions);
              keysList.appendChild(row);
            });
            if (!keys.length) {
              keysList.innerHTML = '<p>No keys yet.</p>';
            }
          } catch (err) {
            keysList.innerHTML = '<p>Failed to load keys.</p>';
            showStatus(err.message || String(err), true);
          }
        }

        document.getElementById('save-admin-key').addEventListener('click', () => {
          const value = keyInput.value.trim();
          setStoredKey(value);
          if (value) {
            showStatus('Admin key saved.', false);
            refreshAll();
          } else {
            showStatus('Cleared admin key.', false);
            metricsGrid.innerHTML = '';
            sloTableBody.innerHTML = '';
            keysList.innerHTML = '';
          }
        });

        document.getElementById('clear-admin-key').addEventListener('click', () => {
          keyInput.value = '';
          setStoredKey('');
          showStatus('Cleared admin key.', false);
          metricsGrid.innerHTML = '';
          sloTableBody.innerHTML = '';
          keysList.innerHTML = '';
          datasetsList.innerHTML = '';
        });

        createForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const payload = {
            name: (document.getElementById('key-name').value || '').trim() || null,
            role: document.getElementById('key-role').value,
            quota_daily: document.getElementById('key-quota-daily').value || null,
            quota_monthly: document.getElementById('key-quota-monthly').value || null,
          };
          ['quota_daily', 'quota_monthly'].forEach((field) => {
            if (payload[field] !== null && payload[field] !== '') {
              payload[field] = Number(payload[field]);
            } else {
              payload[field] = null;
            }
          });
          try {
            const response = await authedFetch('/v1/admin/api-keys', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
            const result = await response.json();
            showStatus('Created key #' + result.id + ' · secret: ' + result.raw_key, false);
            createForm.reset();
            await loadKeys();
          } catch (err) {
            showStatus(err.message || String(err), true);
          }
        });

        async function refreshAll() {
          if (!getStoredKey()) {
            return;
          }
          await Promise.all([loadMetrics(), loadSlo(), loadKeys(), loadDatasets()]);
        }

        if (getStoredKey()) {
          refreshAll();
        } else {
          showStatus('Enter an admin API key to begin.', false);
        }
      })();
    </script>
  </body>
</html>`;
}
