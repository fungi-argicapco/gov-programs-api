<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { derived } from 'svelte/store';
  import { AtlasBadge, AtlasButton, AtlasEvidenceBlock, AtlasInput, AtlasSelect } from '@atlas/components';
  import type { ProgramFilters, ProgramListItem, ProgramListResponse } from '$lib/api/programs';

  export let data: {
    filters: ProgramFilters;
    programs: ProgramListResponse;
    error: string | null;
  };

  const countryOptions = [
    { value: 'US', label: 'United States' },
    { value: 'CA', label: 'Canada' }
  ];

  const benefitTypeOptions = [
    { value: 'grant', label: 'Grant' },
    { value: 'rebate', label: 'Rebate' },
    { value: 'tax_credit', label: 'Tax credit' },
    { value: 'loan', label: 'Loan' },
    { value: 'guarantee', label: 'Guarantee' },
    { value: 'voucher', label: 'Voucher' },
    { value: 'other', label: 'Other' }
  ];

  const statusOptions = [
    { value: 'open', label: 'Open' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'closed', label: 'Closed' },
    { value: 'unknown', label: 'Unknown' }
  ];

  const sortOptions = [
    { value: '-updated_at', label: 'Updated (newest)' },
    { value: 'updated_at', label: 'Updated (oldest)' },
    { value: 'title', label: 'Title A→Z' },
    { value: '-title', label: 'Title Z→A' }
  ];

  let search = '';
  let selectedCountry = 'US';
  let from = '';
  let to = '';
  let sort = '-updated_at';
  let selectedBenefits = new Set<string>();
  let selectedStatuses = new Set<string>();

  $: {
    const current = data.filters ?? {};
    search = current.q ?? '';
    selectedCountry = current.country ?? 'US';
    from = current.from ?? '';
    to = current.to ?? '';
    sort = current.sort ?? '-updated_at';
    selectedBenefits = new Set(current.benefitTypes ?? []);
    selectedStatuses = new Set(current.statuses ?? []);
  }

  const queryString = derived(page, ($page) => $page.url.search);

  function toggleSelection(set: Set<string>, value: string, checked: boolean) {
    const next = new Set(set);
    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
    return next;
  }

  function formatDate(value: string | null): string {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function formatCountry(code: string): string {
    const option = countryOptions.find((item) => item.value === code);
    return option?.label ?? code;
  }

  function formatBenefit(benefit: ProgramListItem['benefit_type']): string {
    const option = benefitTypeOptions.find((item) => item.value === benefit);
    return option?.label ?? '—';
  }

  function formatFreshness(updatedAt: number): string {
    const now = Date.now();
    const timestampMs = updatedAt > 1e12 ? updatedAt : updatedAt * 1000;
    const diff = timestampMs ? now - timestampMs : NaN;
    if (!Number.isFinite(diff)) return 'unknown';
    const days = Math.round(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 7) return `${days} days ago`;
    const weeks = Math.round(days / 7);
    if (weeks === 1) return '1 week ago';
    if (weeks < 5) return `${weeks} weeks ago`;
    const months = Math.round(days / 30);
    return months <= 1 ? '1 month ago' : `${months} months ago`;
  }

  function resolveSource(url: string | null): string {
    if (!url) return 'Source unavailable';
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  function benefitDescription(program: ProgramListItem): string {
    if (program.summary) {
      return program.summary;
    }
    if (program.url) {
      return 'View source notice for eligibility details.';
    }
    return 'No additional context provided.';
  }

  function submitFilters(event: SubmitEvent) {
    event.preventDefault();
    const params = new URLSearchParams();

    const trimmed = search.trim();
    if (trimmed) params.set('q', trimmed);
    if (selectedCountry) params.set('country', selectedCountry);

    selectedBenefits.forEach((benefit) => params.append('benefit_type[]', benefit));
    selectedStatuses.forEach((status) => params.append('status[]', status));

    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (sort) params.set('sort', sort);

    params.set('page', '1');
    params.set('page_size', String(data.filters.pageSize ?? 25));

    const query = params.toString();
    goto(query ? `?${query}` : '?', { replaceState: true, keepfocus: true, noscroll: true });
  }
</script>

<svelte:head>
  <title>Capital Finder · TechLand Atlas</title>
</svelte:head>

<section class="page-intro">
  <div>
    <h1>Capital Finder</h1>
    <p>
      Explore live funding opportunities with filters for geography, program status, and benefit type to
      discover the right stack for your project.
    </p>
  </div>
  <AtlasBadge variant="info" tone="soft">{data.programs.meta.total} programs</AtlasBadge>
</section>

<form class="filters" aria-label="Program filters" on:submit|preventDefault={submitFilters}>
  <fieldset class="filters__field">
    <legend class="filters__legend">Search</legend>
    <AtlasInput label="Keyword" placeholder="e.g., microgrid" bind:value={search} />
  </fieldset>

  <fieldset class="filters__field">
    <legend class="filters__legend">Country</legend>
    <AtlasSelect label="Country" options={countryOptions} bind:value={selectedCountry} />
  </fieldset>

  <fieldset class="filters__field">
    <legend class="filters__legend">Benefit type</legend>
    <div class="filters__options">
      {#each benefitTypeOptions as option}
        <label class="filters__checkbox">
          <input
            type="checkbox"
            name="benefit_type[]"
            value={option.value}
            checked={selectedBenefits.has(option.value)}
            on:change={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              selectedBenefits = toggleSelection(selectedBenefits, option.value, target.checked);
            }}
          />
          <span>{option.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset class="filters__field">
    <legend class="filters__legend">Status</legend>
    <div class="filters__options">
      {#each statusOptions as option}
        <label class="filters__checkbox">
          <input
            type="checkbox"
            name="status[]"
            value={option.value}
            checked={selectedStatuses.has(option.value)}
            on:change={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              selectedStatuses = toggleSelection(selectedStatuses, option.value, target.checked);
            }}
          />
          <span>{option.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset class="filters__field">
    <legend class="filters__legend">Application window</legend>
    <div class="filters__dates">
      <AtlasInput label="Opens after" type="date" bind:value={from} />
      <AtlasInput label="Closes before" type="date" bind:value={to} />
    </div>
  </fieldset>

  <fieldset class="filters__field">
    <legend class="filters__legend">Sort</legend>
    <AtlasSelect label="Order" options={sortOptions} bind:value={sort} />
  </fieldset>

  <div class="filters__actions">
    <AtlasButton type="submit">Apply filters</AtlasButton>
    <AtlasButton
      type="button"
      variant="ghost"
      on:click={() => {
        search = '';
        selectedCountry = 'US';
        from = '';
        to = '';
        sort = '-updated_at';
        selectedBenefits = new Set();
        selectedStatuses = new Set();
        goto('?country=US&sort=-updated_at', { replaceState: true, keepfocus: true, noscroll: true });
      }}
    >
      Reset
    </AtlasButton>
  </div>
</form>

{#if data.error}
  <section class="notice notice--error" role="alert">
    <h2>Unable to load programs</h2>
    <p>{data.error}</p>
  </section>
{:else if data.programs.data.length === 0}
  <section class="notice" role="status">
    <h2>No programs match these filters</h2>
    <p>Try broadening the benefit types or clearing the application window to see more results.</p>
  </section>
{:else}
  <section class="results" aria-live="polite">
    <header class="results__summary">
      <p>
        Showing <strong>{data.programs.data.length}</strong> of <strong>{data.programs.meta.total}</strong> programs
        {#if $queryString}
          for query <code>{$queryString}</code>
        {/if}
      </p>
    </header>

    <div class="results__table" role="table" aria-label="Program results">
      <div class="results__header" role="row">
        <div role="columnheader">Program</div>
        <div role="columnheader">Benefit</div>
        <div role="columnheader">Country</div>
        <div role="columnheader">Deadline</div>
        <div role="columnheader">Evidence</div>
      </div>

      {#each data.programs.data as program (program.id)}
        <article class="results__row" role="row">
          <div role="cell" class="results__title">
            <a href={program.url ?? '#'} target={program.url ? '_blank' : undefined} rel="noreferrer">
              {program.title}
            </a>
            <p class="results__summary-text">{program.summary ?? 'No summary provided.'}</p>
            <AtlasBadge variant="neutral" tone="soft">{program.authority_level}</AtlasBadge>
          </div>
          <div role="cell" class="results__cell">{formatBenefit(program.benefit_type)}</div>
          <div role="cell" class="results__cell">{formatCountry(program.country_code)}</div>
          <div role="cell" class="results__cell">{formatDate(program.end_date)}</div>
         <div role="cell" class="results__cell">
           <AtlasEvidenceBlock
              source={resolveSource(program.url)}
              freshness={formatFreshness(program.updated_at)}
              lineageHref={program.url ?? undefined}
              description={benefitDescription(program)}
            />
         </div>
        </article>
      {/each}
    </div>
  </section>
{/if}

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
    max-width: 52ch;
  }

  .filters {
    display: grid;
    gap: var(--atlas-space-lg);
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    padding: var(--atlas-space-lg);
    border-radius: var(--atlas-radius-xl);
    border: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 65%, transparent);
    background: color-mix(in srgb, var(--atlas-color-surface-default) 92%, transparent);
  }

  .filters__field {
    margin: 0;
    border: none;
    padding: 0;
    display: grid;
    gap: var(--atlas-space-sm);
  }

  .filters__legend {
    margin: 0;
    font-size: var(--atlas-type-scale-sm-font-size);
    font-weight: var(--atlas-type-weight-medium);
    text-transform: uppercase;
    letter-spacing: var(--atlas-type-letter-spacing-loose);
    color: var(--atlas-color-content-muted);
  }

  .filters__options {
    display: grid;
    gap: var(--atlas-space-2xs);
  }

  .filters__checkbox {
    display: flex;
    align-items: center;
    gap: var(--atlas-space-2xs);
    font-size: var(--atlas-type-scale-sm-font-size);
  }

  .filters__dates {
    display: grid;
    gap: var(--atlas-space-xs);
  }

  .filters__actions {
    display: flex;
    align-items: center;
    gap: var(--atlas-space-sm);
    justify-content: flex-start;
  }

  .notice {
    margin-top: var(--atlas-space-xl);
    padding: var(--atlas-space-lg);
    border-radius: var(--atlas-radius-xl);
    border: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 65%, transparent);
    background: color-mix(in srgb, var(--atlas-color-background-muted) 40%, transparent);
    display: grid;
    gap: var(--atlas-space-xs);
  }

  .notice--error {
    border-color: color-mix(in srgb, var(--atlas-color-accent-critical) 40%, transparent);
    background: color-mix(in srgb, var(--atlas-color-accent-critical) 12%, transparent);
  }

  .results {
    display: grid;
    gap: var(--atlas-space-lg);
  }

  .results__summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--atlas-space-md);
    color: var(--atlas-color-content-secondary);
  }

  .results__table {
    display: grid;
    gap: var(--atlas-space-sm);
  }

  .results__header,
  .results__row {
    display: grid;
    grid-template-columns: 2.2fr 1fr 0.8fr 0.8fr 1.2fr;
    gap: var(--atlas-space-md);
    align-items: start;
  }

  .results__header {
    font-size: var(--atlas-type-scale-xs-font-size);
    text-transform: uppercase;
    letter-spacing: var(--atlas-type-letter-spacing-loose);
    color: var(--atlas-color-content-muted);
  }

  .results__row {
    padding: var(--atlas-space-lg);
    border-radius: var(--atlas-radius-xl);
    border: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 60%, transparent);
    background: color-mix(in srgb, var(--atlas-color-surface-default) 92%, transparent);
    box-shadow: var(--atlas-elevation-raised);
  }

  .results__title {
    display: grid;
    gap: var(--atlas-space-2xs);
  }

  .results__title a {
    color: var(--atlas-color-content-primary);
    font-weight: var(--atlas-type-weight-semibold);
    text-decoration: none;
  }

  .results__title a:hover,
  .results__title a:focus-visible {
    text-decoration: underline;
  }

  .results__summary-text {
    margin: 0;
    color: var(--atlas-color-content-secondary);
    font-size: var(--atlas-type-scale-sm-font-size);
  }

  .results__cell {
    display: flex;
    align-items: center;
    font-size: var(--atlas-type-scale-sm-font-size);
  }

  @media (max-width: 960px) {
    .results__header,
    .results__row {
      grid-template-columns: 1fr;
    }

    .results__cell {
      justify-content: flex-start;
    }
  }

  @media (max-width: 720px) {
    .page-intro {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--atlas-space-md);
    }

    .filters__actions {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
