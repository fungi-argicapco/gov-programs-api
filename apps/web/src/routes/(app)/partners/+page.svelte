<script lang="ts">
  import {
    AtlasBadge,
    AtlasEvidenceBlock,
    AtlasReportCard,
    AtlasInput,
    AtlasSelect
  } from '@atlas/components';
  import { PARTNERS } from '$lib/data/partners';

  const modelOptions = [
    { value: 'all', label: 'All delivery models' },
    ...Array.from(new Set(PARTNERS.map((partner) => partner.deliveryModel))).map((model) => ({
      value: model,
      label: model
    }))
  ];

  let deliveryModel = 'all';
  let searchTerm = '';

  $: filteredPartners = PARTNERS.filter((partner) => {
    const matchesModel = deliveryModel === 'all' || partner.deliveryModel === deliveryModel;
    const haystack = `${partner.name} ${partner.location} ${partner.focusAreas.join(' ')}`.toLowerCase();
    const matchesSearch = !searchTerm || haystack.includes(searchTerm.toLowerCase());
    return matchesModel && matchesSearch;
  });
</script>

<svelte:head>
  <title>Partners Directory · TechLand Atlas</title>
</svelte:head>

<section class="page-intro">
  <div>
    <h1>Partners Directory</h1>
    <p>
      Evaluate delivery and technology partners with shared scoring and evidence. Compare specialties,
      trust metrics, and the latest diligence notes.
    </p>
  </div>
  <AtlasBadge variant="primary" tone="soft">{filteredPartners.length} profiles</AtlasBadge>
</section>

<section class="filters" aria-label="Partner filters">
  <AtlasInput
    label="Search"
    placeholder="Search by partner, location or capability"
    bind:value={searchTerm}
  />
  <AtlasSelect
    label="Delivery model"
    options={modelOptions}
    bind:value={deliveryModel}
  />
</section>

<section class="partner-grid" aria-label="Partner listings">
  {#each filteredPartners as partner (partner.id)}
    <article class="partner-card">
      <header class="partner-card__header">
        <div>
          <p class="partner-card__location">{partner.location}</p>
          <h2>{partner.name}</h2>
        </div>
        <AtlasBadge variant="neutral" tone="soft">{partner.deliveryModel}</AtlasBadge>
      </header>

      <div class="partner-card__focus">
        {#each partner.focusAreas as area}
          <span>{area}</span>
        {/each}
      </div>

      <AtlasReportCard
        title={partner.report.title}
        subtitle={partner.report.subtitle}
        metrics={partner.report.metrics}
        references={partner.report.references ?? []}
        accent={partner.report.accent ?? 'info'}
      />

      <div class="partner-card__evidence">
        {#each partner.evidence as evidence (evidence.source)}
          <AtlasEvidenceBlock
            source={evidence.source}
            freshness={evidence.freshness}
            lineageHref={evidence.lineageHref}
            description={evidence.description}
          />
        {/each}
      </div>
    </article>
  {/each}
</section>

<style>
  .page-intro {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--atlas-space-lg);
  }

  .page-intro h1 {
    margin: 0 0 var(--atlas-space-2xs);
    font-size: var(--atlas-type-scale-2xl-font-size);
  }

  .page-intro p {
    margin: 0;
    color: var(--atlas-color-content-secondary);
    max-width: 48ch;
  }

  .filters {
    display: grid;
    gap: var(--atlas-space-md);
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    background: color-mix(in srgb, var(--atlas-color-surface-default) 92%, transparent);
    border-radius: var(--atlas-radius-xl);
    padding: var(--atlas-space-lg);
    border: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 65%, transparent);
  }

  .partner-grid {
    display: grid;
    gap: var(--atlas-space-xl);
  }

  .partner-card {
    display: grid;
    gap: var(--atlas-space-lg);
  }

  .partner-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--atlas-space-md);
  }

  .partner-card__location {
    margin: 0;
    font-size: var(--atlas-type-scale-xs-font-size);
    letter-spacing: var(--atlas-type-letter-spacing-loose);
    text-transform: uppercase;
    color: var(--atlas-color-content-muted);
  }

  .partner-card__focus {
    display: flex;
    flex-wrap: wrap;
    gap: var(--atlas-space-xs);
    color: var(--atlas-color-content-secondary);
    font-size: var(--atlas-type-scale-xs-font-size);
  }

  .partner-card__focus span {
    padding: var(--atlas-space-3xs) var(--atlas-space-xs);
    border-radius: var(--atlas-radius-pill);
    background: color-mix(in srgb, var(--atlas-color-background-muted) 70%, transparent);
  }

  .partner-card__evidence {
    display: grid;
    gap: var(--atlas-space-sm);
  }

  @media (max-width: 720px) {
    .page-intro {
      flex-direction: column;
    }
  }
</style>
