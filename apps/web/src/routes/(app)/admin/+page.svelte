<svelte:head>
  <title>Admin · TechLand Atlas</title>
</svelte:head>

<section class="placeholder">
  <h1>Admin Center</h1>
  <p>
    Governance tooling, RBAC controls and licensing guardrails will surface here during Sprint 7. The
    placeholder keeps routing intact for early shell testing.
  </p>
</section>

<style>
  .placeholder {
    display: grid;
    gap: var(--atlas-space-md);
    max-width: 640px;
  }

  h1 {
    margin: 0;
    font-size: var(--atlas-type-scale-2xl-font-size);
  }

  p {
    margin: 0;
    color: var(--atlas-color-content-secondary);
  }
</style>
