<script lang="ts">
  const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

  type RequestedApps = {
    website: boolean;
    program: boolean;
    canvas: boolean;
  };

  type FormState = {
    email: string;
    displayName: string;
    justification: string;
    apps: RequestedApps;
  };

  type SubmitState = 'idle' | 'loading' | 'success' | 'error';

  const defaultState: FormState = {
    email: '',
    displayName: '',
    justification: '',
    apps: {
      website: false,
      program: true,
      canvas: true
    }
  };

  let state: FormState = structuredClone(defaultState);
  let submitState: SubmitState = 'idle';
  let errorMessage = '';
  let requestId: string | null = null;
  let expiresAt: string | null = null;

  const now = new Date();
  const timeline = [
    {
      title: 'Submit request',
      description: 'Share your work email, display name, and which apps you need access to.'
    },
    {
      title: 'Operations review',
      description: 'An operator approves the request and provisions your account in minutes.'
    },
    {
      title: 'Activate & explore',
      description: 'Use the signup email to set your password, explore canvases, and call the API.'
    }
  ];

  function apiUrl(path: string): string {
    return `${API_BASE}${path}`;
  }

  function resetForm() {
    state = structuredClone(defaultState);
  }

  async function submitRequest(event: SubmitEvent) {
    event.preventDefault();
    if (submitState === 'loading') return;
    submitState = 'loading';
    errorMessage = '';
    requestId = null;
    expiresAt = null;

    const payload = {
      email: state.email.trim().toLowerCase(),
      display_name: state.displayName.trim(),
      justification: state.justification.trim() || undefined,
      requested_apps: state.apps
    };

    if (!payload.email || !payload.display_name) {
      submitState = 'error';
      errorMessage = 'Email and display name are required.';
      return;
    }

    try {
      const response = await fetch(apiUrl('/v1/account/request'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const fallback = body?.error ?? response.statusText;
        errorMessage = fallback || 'Unable to submit request.';
        submitState = 'error';
        return;
      }

      submitState = 'success';
      requestId = body?.request?.id ?? null;
      expiresAt = body?.decision_token_expires_at ?? null;
      resetForm();
    } catch (error) {
      console.error('Failed to submit account request', error);
      errorMessage = 'Network error while submitting request. Try again shortly.';
      submitState = 'error';
    }
  }

  function toggleApp(key: keyof RequestedApps) {
    state = {
      ...state,
      apps: {
        ...state.apps,
        [key]: !state.apps[key]
      }
    };
  }
</script>

<svelte:head>
  <title>Government Programs API · Request Access</title>
  <meta
    name="description"
    content="Request access to the Government Programs API and Canvas workspace to explore curated funding programs."
  />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<main class="page">
  <section class="hero">
    <div class="hero__badge">FungiAgricap Platform</div>
    <h1>Launch funding programs faster</h1>
    <p>
      Request access to the Government Programs API, curated datasets, and a collaborative canvas so your
      team can discover, compare, and act on opportunities without wading through PDFs.
    </p>
    <div class="hero__highlights">
      <article>
        <h2>Curated coverage</h2>
        <p>US federal, state, and Canadian provincial programs refreshed every four hours.</p>
      </article>
      <article>
        <h2>Neutral scoring</h2>
        <p>Transparent matching models with audit trails and jurisdiction filters.</p>
      </article>
      <article>
        <h2>Operator tooling</h2>
        <p>Alerts, saved searches, and enrichment pipelines built for public sector teams.</p>
      </article>
    </div>
  </section>

  <section class="layout">
    <form class="form" on:submit={submitRequest} aria-describedby="form-status">
      <header>
        <h2>Request access</h2>
        <p>We use your details to pre-provision the API keys, Canvas workspace, and onboarding emails.</p>
      </header>

      <label>
        <span>Email address</span>
        <input
          type="email"
          required
          placeholder="you@organization.gov"
          bind:value={state.email}
          autocomplete="email"
        />
      </label>

      <label>
        <span>Display name</span>
        <input
          type="text"
          required
          placeholder="Jordan Lee"
          bind:value={state.displayName}
          autocomplete="name"
        />
      </label>

      <fieldset>
        <legend>Apps needed</legend>
        <label class="checkbox">
          <input type="checkbox" bind:checked={state.apps.program} on:change={() => toggleApp('program')} />
          <span>Program API</span>
        </label>
        <label class="checkbox">
          <input type="checkbox" bind:checked={state.apps.canvas} on:change={() => toggleApp('canvas')} />
          <span>Canvas workspace</span>
        </label>
        <label class="checkbox">
          <input type="checkbox" bind:checked={state.apps.website} on:change={() => toggleApp('website')} />
          <span>Public website</span>
        </label>
      </fieldset>

      <label>
        <span>How will you use the data? <em>(optional)</em></span>
        <textarea
          rows="4"
          placeholder="Share context so we can route you to the right programs."
          bind:value={state.justification}
        ></textarea>
      </label>

      <button type="submit" class:busy={submitState === 'loading'} disabled={submitState === 'loading'}>
        {submitState === 'loading' ? 'Submitting…' : 'Request access'}
      </button>

      <output id="form-status" aria-live="polite">
        {#if submitState === 'error'}
          <span class="status status--error">{errorMessage}</span>
        {:else if submitState === 'success'}
          <span class="status status--success">
            {#if requestId}
              Request <code>{requestId}</code> received.
            {/if}
            {#if expiresAt}
              Decision link expires {new Date(expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.
            {/if}
            We'll email you once an operator approves the request.
          </span>
        {/if}
      </output>
    </form>

    <aside class="sidebar">
      <div class="card">
        <h3>What happens next?</h3>
        <ol>
          {#each timeline as step, idx}
            <li>
              <span class="step">{idx + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
            </li>
          {/each}
        </ol>
      </div>

      <div class="card">
        <h3>Today's ingestion status</h3>
        <p>
          Last run&nbsp;
          <time datetime={now.toISOString()}>{now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
        </p>
        <p class="hint">
          Use the admin console to review detailed metrics, API latency budgets, and ingestion diff samples.
        </p>
        <a class="link" href="/docs" rel="noopener">Explore API docs →</a>
      </div>
    </aside>
  </section>
</main>

<style>
  .page {
    max-width: 1180px;
    margin: 0 auto;
    padding: 48px 20px 120px;
    display: flex;
    flex-direction: column;
    gap: 48px;
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 960px;
  }

  .hero h1 {
    font-size: clamp(2.4rem, 3vw, 3.2rem);
    margin: 0;
    color: #0f172a;
    font-weight: 700;
  }

  .hero p {
    margin: 0;
    font-size: 1.05rem;
    max-width: 720px;
    color: rgba(15, 23, 42, 0.82);
  }

  .hero__badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(14, 165, 233, 0.12);
    border: 1px solid rgba(14, 165, 233, 0.25);
    color: #0369a1;
    font-weight: 600;
    width: fit-content;
  }

  .hero__highlights {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-top: 12px;
  }

  .hero__highlights article {
    background: rgba(255, 255, 255, 0.75);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
    backdrop-filter: blur(8px);
  }

  .hero__highlights h2 {
    margin: 0 0 8px;
    font-size: 1.05rem;
    color: #0f172a;
  }

  .hero__highlights p {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(15, 23, 42, 0.75);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 24px;
    align-items: start;
  }

  .form {
    background: rgba(255, 255, 255, 0.9);
    border-radius: 24px;
    padding: 28px;
    box-shadow: 0 18px 60px rgba(15, 23, 42, 0.12);
    border: 1px solid rgba(148, 163, 184, 0.18);
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .form header h2 {
    margin: 0;
    font-size: 1.4rem;
    color: #0f172a;
  }

  .form header p {
    margin: 6px 0 0;
    color: rgba(15, 23, 42, 0.65);
    font-size: 0.98rem;
  }

  label span {
    display: flex;
    justify-content: space-between;
    font-weight: 600;
    margin-bottom: 6px;
    color: #0f172a;
  }

  label em {
    font-weight: 400;
    font-style: normal;
    color: rgba(15, 23, 42, 0.6);
  }

  input[type='email'],
  input[type='text'],
  textarea {
    width: 100%;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    padding: 12px 14px;
    font: inherit;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    background: rgba(255, 255, 255, 0.95);
  }

  input:focus,
  textarea:focus {
    border-color: rgba(14, 165, 233, 0.6);
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.18);
    outline: none;
  }

  fieldset {
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 16px;
    padding: 14px 16px;
    display: grid;
    gap: 10px;
    background: rgba(255, 255, 255, 0.75);
  }

  fieldset legend {
    font-weight: 600;
    padding: 0 6px;
    color: rgba(15, 23, 42, 0.85);
  }

  .checkbox {
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 0.98rem;
  }

  .checkbox input {
    width: 18px;
    height: 18px;
  }

  button {
    background: linear-gradient(135deg, #0284c7, #0ea5e9);
    color: white;
    border: none;
    border-radius: 14px;
    padding: 12px 18px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.1s ease;
  }

  button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 12px 24px rgba(14, 165, 233, 0.25);
  }

  button:disabled {
    opacity: 0.65;
    cursor: progress;
  }

  button.busy {
    cursor: progress;
  }

  output {
    display: block;
    min-height: 24px;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 500;
  }

  .status--error {
    background: rgba(239, 68, 68, 0.12);
    color: #b91c1c;
  }

  .status--success {
    background: rgba(16, 185, 129, 0.14);
    color: #047857;
  }

  .status code {
    background: rgba(15, 23, 42, 0.08);
    padding: 2px 6px;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .sidebar {
    display: grid;
    gap: 16px;
  }

  .card {
    background: rgba(15, 23, 42, 0.88);
    color: rgba(248, 250, 252, 0.95);
    border-radius: 24px;
    padding: 24px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    box-shadow: 0 14px 45px rgba(15, 23, 42, 0.45);
  }

  .card h3 {
    margin: 0 0 12px;
    font-size: 1.1rem;
  }

  .card ol {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 14px;
  }

  .card li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: start;
  }

  .card .step {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(14, 165, 233, 0.18);
    color: rgba(56, 189, 248, 0.95);
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .card p {
    margin: 4px 0 0;
    color: rgba(241, 245, 249, 0.85);
    font-size: 0.95rem;
  }

  .card time {
    font-weight: 600;
  }

  .hint {
    margin-top: 16px;
    font-size: 0.9rem;
    color: rgba(191, 219, 254, 0.8);
  }

  .link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 16px;
    color: rgba(125, 211, 252, 0.95);
    font-weight: 600;
    text-decoration: none;
  }

  @media (max-width: 1024px) {
    .layout {
      grid-template-columns: 1fr;
    }

    .sidebar {
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }
  }

  @media (max-width: 720px) {
    .page {
      padding: 32px 16px 80px;
    }

    .hero__highlights {
      grid-template-columns: 1fr;
    }

    .form {
      padding: 22px;
    }
  }
</style>
