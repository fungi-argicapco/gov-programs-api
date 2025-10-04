<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ReportMetric, ReportMetricKey, ReportReference } from './types';

  export let title: string;
  export let subtitle: string | undefined;
  export let metrics: ReportMetric[] = [];
  export let references: ReportReference[] = [];
  export let accent: 'primary' | 'info' | 'neutral' = 'primary';

  const dispatch = createEventDispatcher<{ toggle: { key: ReportMetricKey; open: boolean } }>();

  function clampScore(score: number): number {
    if (Number.isNaN(score)) return 0;
    return Math.min(100, Math.max(0, score));
  }

  function progressLabel(metric: ReportMetric): string {
    const score = clampScore(metric.score);
    return `${metric.label} score ${score} out of 100`;
  }

  function onToggle(event: Event, metric: ReportMetric) {
    const element = event.currentTarget as HTMLDetailsElement | null;
    dispatch('toggle', { key: metric.key, open: element?.open ?? false });
  }
</script>

<article class="atlas-report-card" data-accent={accent}>
  <header class="atlas-report-card__header">
    <div>
      <h3>{title}</h3>
      {#if subtitle}
        <p class="atlas-report-card__subtitle">{subtitle}</p>
      {/if}
    </div>
    <slot name="badge"></slot>
  </header>

  <section class="atlas-report-card__metrics" aria-label="Report metrics">
    {#each metrics as metric (metric.key)}
      <details class="atlas-report-card__metric" on:toggle={(event) => onToggle(event, metric)}>
        <summary>
          <div class="atlas-report-card__metric-header">
            <div class="atlas-report-card__gauge" role="group" aria-label={progressLabel(metric)}>
              <div
                class="atlas-report-card__gauge-bar"
                style={`--atlas-gauge-value: ${clampScore(metric.score) / 100};`}
              ></div>
              <span class="atlas-report-card__gauge-score">{clampScore(metric.score)}</span>
            </div>
            <div>
              <p class="atlas-report-card__metric-title">{metric.label}</p>
              <p class="atlas-report-card__metric-summary">{metric.summary}</p>
            </div>
          </div>
        </summary>
        {#if metric.details?.length}
          <div class="atlas-report-card__metric-details">
            <ul>
              {#each metric.details as detail, index}
                <li>
                  <span class="atlas-report-card__metric-index" aria-hidden="true">{index + 1}.</span>
                  <span>{detail}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </details>
    {/each}
  </section>

  {#if references.length || $$slots.references}
    <section class="atlas-report-card__references" aria-label="References">
      <h4>References</h4>
      <ul>
        {#each references as reference}
          <li>
            {#if reference.href}
              <a href={reference.href} target="_blank" rel="noreferrer" class="atlas-report-card__reference-link">
                <span>{reference.label}</span>
                {#if reference.description}
                  <span class="atlas-report-card__reference-description">{reference.description}</span>
                {/if}
              </a>
            {:else}
              <span>
                <span>{reference.label}</span>
                {#if reference.description}
                  <span class="atlas-report-card__reference-description">{reference.description}</span>
                {/if}
              </span>
            {/if}
          </li>
        {/each}
      </ul>
      <slot name="references"></slot>
    </section>
  {/if}
</article>

<style>
  :global(:where(.atlas-report-card)) {
    font-family: var(--atlas-type-font-family-sans);
  }

  .atlas-report-card {
    display: grid;
    gap: var(--atlas-space-xl);
    padding: var(--atlas-space-xl);
    background: var(--atlas-color-surface-default);
    border-radius: var(--atlas-radius-xl);
    border: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 70%, transparent);
    box-shadow: var(--atlas-elevation-raised);
  }

  .atlas-report-card[data-accent='primary'] {
    border-top: 4px solid var(--atlas-color-accent-primary);
  }

  .atlas-report-card[data-accent='info'] {
    border-top: 4px solid var(--atlas-color-accent-info);
  }

  .atlas-report-card[data-accent='neutral'] {
    border-top: 4px solid var(--atlas-color-border-subtle);
  }

  .atlas-report-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--atlas-space-md);
  }

  h3 {
    margin: 0;
    font-size: var(--atlas-type-scale-xl-font-size);
    line-height: var(--atlas-type-scale-xl-line-height);
  }

  .atlas-report-card__subtitle {
    margin: var(--atlas-space-2xs) 0 0;
    color: var(--atlas-color-content-secondary);
    font-size: var(--atlas-type-scale-sm-font-size);
  }

  .atlas-report-card__metrics {
    display: grid;
    gap: var(--atlas-space-md);
  }

  .atlas-report-card__metric {
    border-radius: var(--atlas-radius-lg);
    border: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 60%, transparent);
    background: color-mix(in srgb, var(--atlas-color-surface-default) 85%, transparent);
    overflow: hidden;
  }

  .atlas-report-card__metric summary {
    list-style: none;
    cursor: pointer;
    padding: var(--atlas-space-md) var(--atlas-space-lg);
    display: flex;
    align-items: center;
  }

  .atlas-report-card__metric summary::-webkit-details-marker {
    display: none;
  }

  .atlas-report-card__metric-header {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--atlas-space-lg);
    align-items: center;
    width: 100%;
  }

  .atlas-report-card__gauge {
    position: relative;
    width: 88px;
    height: 88px;
    border-radius: 50%;
    background: conic-gradient(
      var(--atlas-color-accent-primary) calc(var(--atlas-gauge-value) * 100%),
      color-mix(in srgb, var(--atlas-color-accent-primary) 18%, transparent) 0
    );
    display: grid;
    place-items: center;
    color: var(--atlas-color-content-inverse);
  }

  .atlas-report-card[data-accent='info'] .atlas-report-card__gauge {
    background: conic-gradient(
      var(--atlas-color-accent-info) calc(var(--atlas-gauge-value) * 100%),
      color-mix(in srgb, var(--atlas-color-accent-info) 18%, transparent) 0
    );
  }

  .atlas-report-card[data-accent='neutral'] .atlas-report-card__gauge {
    background: conic-gradient(\n      color-mix(in srgb, var(--atlas-color-content-muted) 80%, transparent) calc(var(--atlas-gauge-value) * 100%),
      color-mix(in srgb, var(--atlas-color-content-muted) 25%, transparent) 0
    );
  }

  .atlas-report-card__gauge::before {
    content: '';
    position: absolute;
    width: 68px;
    height: 68px;
    border-radius: 50%;
    background: var(--atlas-color-surface-default);
  }

  .atlas-report-card__gauge-score {
    position: relative;
    font-size: var(--atlas-type-scale-lg-font-size);
    font-weight: var(--atlas-type-weight-semibold);
  }

  .atlas-report-card__metric-title {
    margin: 0;
    font-weight: var(--atlas-type-weight-medium);
    font-size: var(--atlas-type-scale-body-font-size);
  }

  .atlas-report-card__metric-summary {
    margin: var(--atlas-space-3xs) 0 0;
    color: var(--atlas-color-content-secondary);
    font-size: var(--atlas-type-scale-sm-font-size);
  }

  .atlas-report-card__metric-details {
    padding: 0 var(--atlas-space-lg) var(--atlas-space-lg);
    color: var(--atlas-color-content-secondary);
    font-size: var(--atlas-type-scale-sm-font-size);
  }

  .atlas-report-card__metric-details ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: var(--atlas-space-xs);
  }

  .atlas-report-card__metric-details li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--atlas-space-xs);
  }

  .atlas-report-card__metric-index {
    font-weight: var(--atlas-type-weight-medium);
    color: var(--atlas-color-content-muted);
  }

  .atlas-report-card__references {
    border-top: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 60%, transparent);
    padding-top: var(--atlas-space-md);
    display: grid;
    gap: var(--atlas-space-sm);
  }

  .atlas-report-card__references h4 {
    margin: 0;
    font-size: var(--atlas-type-scale-sm-font-size);
    text-transform: uppercase;
    letter-spacing: var(--atlas-type-letter-spacing-loose);
    color: var(--atlas-color-content-secondary);
  }

  .atlas-report-card__references ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: var(--atlas-space-xs);
  }

  .atlas-report-card__reference-link {
    display: grid;
    gap: var(--atlas-space-3xs);
    text-decoration: none;
    color: var(--atlas-color-accent-info);
    font-weight: var(--atlas-type-weight-medium);
  }

  .atlas-report-card__reference-link:hover,
  .atlas-report-card__reference-link:focus-visible {
    text-decoration: underline;
  }

  .atlas-report-card__reference-description {
    display: block;
    font-size: var(--atlas-type-scale-xs-font-size);
    color: var(--atlas-color-content-muted);
  }

  @media (max-width: 720px) {
    .atlas-report-card {
      padding: var(--atlas-space-lg);
    }

    .atlas-report-card__metric-header {
      grid-template-columns: 1fr;
      gap: var(--atlas-space-md);
    }

    .atlas-report-card__gauge {
      width: 72px;
      height: 72px;
    }

    .atlas-report-card__gauge::before {
      width: 56px;
      height: 56px;
    }
  }
</style>
