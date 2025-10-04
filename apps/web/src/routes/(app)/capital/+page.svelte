<script lang="ts">
  import {
    AtlasBadge,
    AtlasReportCard,
    AtlasEvidenceBlock,
    AtlasSelect,
    AtlasInput
  } from '@atlas/components';
  import { CAPITAL_PROGRAMS } from '$lib/data/capital';

  const categoryOptions = [
    { value: 'all', label: 'All categories' },
    ...Array.from(new Set(CAPITAL_PROGRAMS.map((program) => program.category))).map((category) => ({
      value: category,
      label: category
    }))
  ];

  let category = 'all';
  let searchTerm = '';

  $: filteredPrograms = CAPITAL_PROGRAMS.filter((program) => {
    const matchesCategory = category === 'all' || program.category === category;
    const matchesSearch = searchTerm
      ? `${program.title} ${program.geography}`.toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    return matchesCategory && matchesSearch;
  });
</script>

<svelte:head>
  <title>Capital Finder · TechLand Atlas</title>
</svelte:head>

<section class="page-intro">
  <div>
    <h1>Capital Finder</h1>
    <p>
      Explore active funding opportunities, review trust metrics, and assemble stacks that match your
      blueprint goals.
    </p>
  </div>
  <AtlasBadge variant="info" tone="soft">{filteredPrograms.length} active programs</AtlasBadge>
</section>

<section class="filters" aria-label="Program filters">
  <AtlasInput
    label="Search"
    placeholder="Search by program or geography"
    bind:value={searchTerm}
  />
  <AtlasSelect
    label="Category"
    options={categoryOptions}
    bind:value={category}
  />
</section>

<section class="program-grid" aria-label="Program listings">
  {#each filteredPrograms as program (program.id)}
    <article class="program-card">
      <header class="program-card__header">
        <div>
          <p class="program-card__eyebrow">{program.geography}</p>
          <h2>{program.title}</h2>
        </div>
        <AtlasBadge variant={program.stackFit === 'Watch' ? 'warning' : 'primary'} tone="soft">
          {program.stackFit}
        </AtlasBadge>
      </header>
      <p class="program-card__meta">
        <span>{program.category}</span>
        <span>·</span>
        <span>Award ceiling {program.awardCeiling}</span>
        <span>·</span>
        <span>Closes {program.closing}</span>
      </p>

      <AtlasReportCard
        title={program.report.title}
        subtitle={program.report.subtitle}
        metrics={program.report.metrics}
        references={program.report.references ?? []}
        accent={program.report.accent ?? 'primary'}
      />

      <div class="program-card__evidence">
        {#each program.evidence as evidence (evidence.source)}
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
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--atlas-space-lg);
  }

  .page-intro h1 {
    margin: 0 0 var(--atlas-space-2xs);
    font-size: var(--atlas-type-scale-2xl-font-size);
    line-height: var(--atlas-type-scale-2xl-line-height);
  }

  .page-intro p {
    margin: 0;
    color: var(--atlas-color-content-secondary);
    max-width: 46ch;
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

  .program-grid {
    display: grid;
    gap: var(--atlas-space-xl);
  }

  .program-card {
    display: grid;
    gap: var(--atlas-space-lg);
  }

  .program-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--atlas-space-md);
  }

  .program-card__eyebrow {
    margin: 0;
    font-size: var(--atlas-type-scale-xs-font-size);
    letter-spacing: var(--atlas-type-letter-spacing-loose);
    text-transform: uppercase;
    color: var(--atlas-color-content-muted);
  }

  .program-card__meta {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--atlas-space-2xs);
    color: var(--atlas-color-content-secondary);
    font-size: var(--atlas-type-scale-xs-font-size);
  }

  .program-card__evidence {
    display: grid;
    gap: var(--atlas-space-sm);
  }

  @media (max-width: 720px) {
    .page-intro {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
