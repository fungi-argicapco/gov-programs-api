<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export type TopBarSearchEvent = { detail: { query: string } };

  export let title = 'TechLand Atlas';
  export let searchPlaceholder = 'Search programs, pages or partners…';
  export let userName = 'Operator';
  export let notifications = 0;

  const dispatch = createEventDispatcher<{
    'toggle-nav': void;
    search: { query: string };
    alerts: void;
    profile: void;
  }>();

  let query = '';

  function submitSearch(event: SubmitEvent) {
    event.preventDefault();
    dispatch('search', { query: query.trim() });
  }
</script>

<header class="top-bar" role="banner">
  <div class="top-bar__section">
    <button
      class="top-bar__menu atlas-focusable"
      type="button"
      aria-label="Toggle navigation"
      on:click={() => dispatch('toggle-nav')}
    >
      ☰
    </button>
    <a class="top-bar__brand" href="/">
      <span class="top-bar__brand-mark" aria-hidden="true">△</span>
      <span class="top-bar__brand-title">{title}</span>
    </a>
  </div>

  <form class="top-bar__search" role="search" aria-label="Global search" on:submit={submitSearch}>
    <input
      name="q"
      type="search"
      bind:value={query}
      placeholder={searchPlaceholder}
      aria-label="Search TechLand"
      class="top-bar__search-input"
    />
    <kbd class="top-bar__shortcut" aria-hidden="true">⌘K</kbd>
  </form>

  <div class="top-bar__actions">
    <button
      class="top-bar__icon atlas-focusable"
      type="button"
      aria-label="View alerts"
      on:click={() => dispatch('alerts')}
    >
      🔔
      {#if notifications > 0}
        <span class="top-bar__badge" aria-hidden="true">{notifications}</span>
      {/if}
    </button>

    <button
      class="top-bar__profile atlas-focusable"
      type="button"
      on:click={() => dispatch('profile')}
      aria-haspopup="menu"
      aria-label="Open profile menu"
    >
      <span class="top-bar__avatar" aria-hidden="true">{userName.slice(0, 1)}</span>
      <span class="top-bar__profile-name">{userName}</span>
    </button>
  </div>
</header>

<style>
  .top-bar {
    position: sticky;
    top: 0;
    z-index: var(--atlas-z-index-sticky);
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--atlas-space-md);
    padding: var(--atlas-space-sm) var(--atlas-space-lg);
    background: color-mix(in srgb, var(--atlas-color-surface-default) 92%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 70%, transparent);
    backdrop-filter: blur(12px);
  }

  .top-bar__section {
    display: flex;
    align-items: center;
    gap: var(--atlas-space-sm);
  }

  .top-bar__menu {
    display: none;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: var(--atlas-radius-md);
    border: 1px solid transparent;
    background: color-mix(in srgb, var(--atlas-color-surface-default) 60%, transparent);
    color: var(--atlas-color-content-primary);
    font-size: 1rem;
  }

  .top-bar__brand {
    display: flex;
    align-items: center;
    gap: var(--atlas-space-xs);
    color: inherit;
    text-decoration: none;
    font-weight: var(--atlas-type-weight-semibold);
  }

  .top-bar__brand-mark {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--atlas-radius-md);
    background: color-mix(in srgb, var(--atlas-color-accent-primary) 24%, transparent);
    color: var(--atlas-color-accent-primary);
    font-size: 1.25rem;
  }

  .top-bar__search {
    position: relative;
    display: flex;
    align-items: center;
  }

  .top-bar__search-input {
    width: min(480px, 100%);
    padding: var(--atlas-space-2xs) var(--atlas-space-lg) var(--atlas-space-2xs) var(--atlas-space-md);
    border-radius: var(--atlas-radius-lg);
    border: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 70%, transparent);
    background: color-mix(in srgb, var(--atlas-color-surface-default) 85%, transparent);
  }

  .top-bar__shortcut {
    position: absolute;
    right: var(--atlas-space-sm);
    padding: 0 var(--atlas-space-2xs);
    border-radius: var(--atlas-radius-sm);
    border: 1px solid color-mix(in srgb, var(--atlas-color-border-default) 65%, transparent);
    background: color-mix(in srgb, var(--atlas-color-surface-default) 80%, transparent);
    color: var(--atlas-color-content-secondary);
    font-size: var(--atlas-type-scale-xs-font-size);
  }

  .top-bar__actions {
    display: flex;
    align-items: center;
    gap: var(--atlas-space-xs);
  }

  .top-bar__icon {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: var(--atlas-radius-pill);
    border: 1px solid transparent;
    background: color-mix(in srgb, var(--atlas-color-surface-default) 70%, transparent);
    font-size: 1rem;
  }

  .top-bar__badge {
    position: absolute;
    top: 6px;
    right: 4px;
    min-width: 18px;
    height: 18px;
    padding: 0 var(--atlas-space-3xs);
    border-radius: var(--atlas-radius-pill);
    background: var(--atlas-color-accent-critical);
    color: var(--atlas-color-content-inverse);
    font-size: var(--atlas-type-scale-xs-font-size);
    display: grid;
    place-items: center;
  }

  .top-bar__profile {
    display: flex;
    align-items: center;
    gap: var(--atlas-space-2xs);
    padding: var(--atlas-space-2xs) var(--atlas-space-sm);
    border-radius: var(--atlas-radius-pill);
    border: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 60%, transparent);
    background: color-mix(in srgb, var(--atlas-color-surface-default) 75%, transparent);
  }

  .top-bar__avatar {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--atlas-radius-pill);
    background: color-mix(in srgb, var(--atlas-color-accent-info) 18%, transparent);
    color: var(--atlas-color-accent-info);
    font-weight: var(--atlas-type-weight-medium);
  }

  .top-bar__profile-name {
    font-weight: var(--atlas-type-weight-medium);
    font-size: var(--atlas-type-scale-sm-font-size);
  }

  @media (max-width: 1080px) {
    .top-bar__menu {
      display: grid;
    }

    .top-bar__actions {
      gap: var(--atlas-space-sm);
    }

  }

  @media (max-width: 900px) {
    .top-bar {
      grid-template-columns: 1fr;
      gap: var(--atlas-space-sm);
    }

    .top-bar__search {
      order: 3;
    }

    .top-bar__actions {
      justify-self: flex-end;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .top-bar, .top-bar * {
      transition: none !important;
    }
  }
</style>
