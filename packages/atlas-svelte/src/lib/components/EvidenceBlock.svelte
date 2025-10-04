<script lang="ts">
  import type { EvidenceBlockProps } from './types';

  export let source: EvidenceBlockProps['source'];
  export let freshness: EvidenceBlockProps['freshness'];
  export let lineageHref: EvidenceBlockProps['lineageHref'];
  export let icon: EvidenceBlockProps['icon'];
  export let description: EvidenceBlockProps['description'];
</script>

<div class="atlas-evidence-block" role="note" aria-label={`Evidence from ${source}`}>
  <div class="atlas-evidence-block__icon" aria-hidden="true">
    {#if icon}
      <span>{icon}</span>
    {:else}
      <span>📎</span>
    {/if}
  </div>
  <div class="atlas-evidence-block__content">
    <p class="atlas-evidence-block__source">{source}</p>
    <p class="atlas-evidence-block__meta">
      <span>Updated {freshness}</span>
      {#if lineageHref}
        <span aria-hidden="true">·</span>
        <a href={lineageHref} target="_blank" rel="noreferrer">View lineage</a>
      {/if}
    </p>
    {#if description}
      <p class="atlas-evidence-block__description">{description}</p>
    {/if}
  </div>
</div>

<style>
  .atlas-evidence-block {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--atlas-space-sm);
    align-items: center;
    padding: var(--atlas-space-sm) var(--atlas-space-md);
    border-radius: var(--atlas-radius-lg);
    border: 1px solid color-mix(in srgb, var(--atlas-color-accent-info) 30%, transparent);
    background: color-mix(in srgb, var(--atlas-color-accent-info) 10%, transparent);
    color: var(--atlas-color-content-primary);
  }

  .atlas-evidence-block__icon {
    width: 32px;
    height: 32px;
    border-radius: var(--atlas-radius-pill);
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--atlas-color-accent-info) 18%, transparent);
    color: var(--atlas-color-accent-info);
    font-size: 1.125rem;
  }

  .atlas-evidence-block__content {
    display: grid;
    gap: var(--atlas-space-3xs);
  }

  .atlas-evidence-block__source {
    margin: 0;
    font-weight: var(--atlas-type-weight-medium);
  }

  .atlas-evidence-block__meta {
    margin: 0;
    display: flex;
    gap: var(--atlas-space-2xs);
    align-items: center;
    color: var(--atlas-color-content-secondary);
    font-size: var(--atlas-type-scale-xs-font-size);
  }

  .atlas-evidence-block__meta a {
    color: inherit;
    text-decoration: underline;
  }

  .atlas-evidence-block__description {
    margin: 0;
    color: var(--atlas-color-content-secondary);
    font-size: var(--atlas-type-scale-sm-font-size);
  }
</style>
