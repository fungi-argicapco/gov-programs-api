<script lang="ts">
  import { browser } from '$app/environment';
  import AtlasBadge from '@atlas/components/Badge.svelte';
  import AtlasButton from '@atlas/components/Button.svelte';
  import AtlasCard from '@atlas/components/Card.svelte';
  import AtlasInput from '@atlas/components/Input.svelte';
  import AtlasModal from '@atlas/components/Modal.svelte';
  import AtlasSelect from '@atlas/components/Select.svelte';

  const badgeVariants = ['neutral', 'primary', 'positive', 'warning', 'critical', 'info'] as const;
  const buttonVariants = ['primary', 'secondary', 'ghost', 'destructive'] as const;

  const countryOptions = [
    { value: 'jp', label: 'Japan' },
    { value: 'de', label: 'Germany' },
    { value: 'pe', label: 'Peru' }
  ];

  let email = 'user@example.org';
  let country = 'jp';
  let modalOpen = false;

  function setTheme(theme: 'light' | 'dark') {
    if (!browser) return;
    document.documentElement.dataset.theme = theme;
  }
</script>

<svelte:head>
  <title>Atlas Design Preview · TechLand</title>
</svelte:head>

<div class="preview">
  <header class="preview__hero">
    <div>
      <p class="preview__eyebrow">Atlas primitives</p>
      <h1>Design system preview</h1>
      <p class="preview__lead">
        Foundation tokens and UI primitives rendered through the Atlas Svelte package. Toggle the
        theme to explore the light and dark palettes.
      </p>
      <div class="preview__actions">
        <AtlasButton on:click={() => setTheme('light')}>Light theme</AtlasButton>
        <AtlasButton variant="secondary" on:click={() => setTheme('dark')}>
          Dark theme
        </AtlasButton>
      </div>
    </div>
  </header>

  <section class="preview__section">
    <h2>Buttons</h2>
    <div class="preview__grid preview__grid--buttons">
      {#each buttonVariants as variant}
        <AtlasButton variant={variant} loading={variant === 'primary'} disabled={variant === 'ghost'}>
          {variant.charAt(0).toUpperCase() + variant.slice(1)} button
        </AtlasButton>
      {/each}
    </div>
  </section>

  <section class="preview__section">
    <h2>Badges</h2>
    <div class="preview__grid preview__grid--badges">
      {#each badgeVariants as variant}
        <AtlasBadge variant={variant} tone={variant === 'neutral' ? 'soft' : 'solid'}>
          {variant}
        </AtlasBadge>
      {/each}
    </div>
  </section>

  <section class="preview__section">
    <h2>Cards & Forms</h2>
    <AtlasCard padding="lg">
      <div class="preview__card-header">
        <div>
          <h3>Opportunity intake</h3>
          <p>Capture key details about a new market or program lead.</p>
        </div>
        <AtlasBadge variant="info" tone="soft">Draft</AtlasBadge>
      </div>
      <form class="preview__form" on:submit|preventDefault={() => (modalOpen = true)}>
        <AtlasInput
          label="Team contact"
          placeholder="you@techland.gov"
          bind:value={email}
          helperText="We’ll share intake decisions at this address."
          required
        />
        <AtlasSelect
          label="Primary geography"
          placeholder="Select a country"
          bind:value={country}
          options={countryOptions}
          required
        />
        <div class="preview__form-actions">
          <AtlasButton type="submit">Submit intake</AtlasButton>
          <AtlasButton variant="ghost" type="button" on:click={() => (modalOpen = true)}>
            Preview summary
          </AtlasButton>
        </div>
      </form>
    </AtlasCard>
  </section>

  <section class="preview__section">
    <h2>Modal</h2>
    <p class="preview__lead">Atlas Modal handles focus trapping and escape shortcuts automatically.</p>
    <AtlasButton on:click={() => (modalOpen = true)}>Open modal</AtlasButton>
  </section>

  <AtlasModal bind:open={modalOpen} title="Submission received" size="sm">
    <p class="preview__modal-body">
      Thanks for sending the program intake request. We’ll send a follow-up email to
      <strong>{email}</strong> once an operator reviews the details for <strong>{country}</strong>.
    </p>
    <div slot="footer" class="preview__modal-actions">
      <AtlasButton variant="secondary" on:click={() => (modalOpen = false)}>Close</AtlasButton>
      <AtlasButton on:click={() => (modalOpen = false)}>View checklist</AtlasButton>
    </div>
  </AtlasModal>
</div>

<style>
  .preview {
    display: grid;
    gap: var(--atlas-space-2xl);
    padding: var(--atlas-space-3xl) var(--atlas-space-2xl);
    color: var(--atlas-color-content-primary);
    background: var(--atlas-color-background-canvas);
  }

  .preview__hero {
    display: grid;
    gap: var(--atlas-space-lg);
    padding: var(--atlas-space-2xl);
    border-radius: var(--atlas-radius-xl);
    background: color-mix(in srgb, var(--atlas-color-surface-raised) 70%, transparent);
    box-shadow: var(--atlas-elevation-raised);
  }

  .preview__eyebrow {
    text-transform: uppercase;
    letter-spacing: var(--atlas-type-letter-spacing-loose);
    font-size: var(--atlas-type-scale-xs-font-size);
    margin: 0;
    color: var(--atlas-color-content-muted);
  }

  h1 {
    margin: 0;
    font-size: var(--atlas-type-scale-2xl-font-size);
    line-height: var(--atlas-type-scale-2xl-line-height);
  }

  .preview__lead {
    margin: 0;
    color: var(--atlas-color-content-secondary);
    max-width: 46ch;
  }

  .preview__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--atlas-space-sm);
  }

  .preview__section {
    display: grid;
    gap: var(--atlas-space-lg);
  }

  .preview__grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--atlas-space-sm);
  }

  .preview__grid--buttons {
    gap: var(--atlas-space-md);
  }

  .preview__card-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--atlas-space-md);
    align-items: center;
  }

  .preview__card-header h3 {
    margin: 0;
  }

  .preview__card-header p {
    margin: 0;
    color: var(--atlas-color-content-secondary);
  }

  .preview__form {
    display: grid;
    gap: var(--atlas-space-lg);
  }

  .preview__form-actions {
    display: flex;
    gap: var(--atlas-space-sm);
  }

  .preview__modal-body {
    margin: 0;
    line-height: var(--atlas-type-scale-body-line-height);
  }

  .preview__modal-actions {
    display: flex;
    gap: var(--atlas-space-sm);
    justify-content: flex-end;
  }

  @media (max-width: 720px) {
    .preview {
      padding: var(--atlas-space-xl);
    }

    .preview__hero {
      padding: var(--atlas-space-xl);
    }
  }
</style>
