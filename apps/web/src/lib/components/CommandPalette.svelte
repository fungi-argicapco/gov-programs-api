<script lang="ts">
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';

  export type PaletteItem = {
    id: string;
    title: string;
    href: string;
    description?: string;
    group?: string;
    keywords?: string;
  };

  export let open = false;
  export let items: PaletteItem[] = [];
  export let query = '';

  const dispatch = createEventDispatcher<{ close: void }>();

  let inputRef: HTMLInputElement | null = null;
  let activeIndex = 0;
  let lastQuery = '';

  const handleKeydown = (event: KeyboardEvent) => {
    if (!browser) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openPalette();
    }
    if (event.key === 'Escape' && open) {
      closePalette();
    }
  };

  function openPalette(initialQuery = '') {
    open = true;
    query = initialQuery;
    activeIndex = 0;
    tick().then(() => inputRef?.focus());
  }

  function closePalette() {
    open = false;
    dispatch('close');
  }

  function normalise(value: string | undefined) {
    return value?.toLowerCase() ?? '';
  }

  $: filtered = items.filter((item) => {
    if (!query) return true;
    const haystack = `${item.title} ${item.description ?? ''} ${item.keywords ?? ''}`;
    return normalise(haystack).includes(normalise(query));
  });

  $: if (open && query !== lastQuery) {
    activeIndex = 0;
    lastQuery = query;
  } else if (!open && lastQuery !== query) {
    lastQuery = query;
  }

  $: if (open) {
    activeIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0));
  }

  function handleNavigation(item: PaletteItem) {
    closePalette();
    goto(item.href);
  }

  function handleInputKeydown(event: KeyboardEvent) {
    if (!filtered.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % filtered.length;
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      handleNavigation(filtered[activeIndex]);
    }
  }

  onMount(() => {
    if (!browser) return;
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    if (!browser) return;
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if open}
  <div class="palette" role="presentation">
    <button
      type="button"
      class="palette__backdrop"
      aria-label="Close command palette"
      on:click={closePalette}
    ></button>
    <div class="palette__dialog" role="dialog" aria-modal="true" aria-label="Command palette">
      <header class="palette__header">
        <input
          bind:this={inputRef}
          bind:value={query}
          type="search"
          placeholder="Search pages or actions"
          aria-label="Command palette search"
          class="palette__input"
          on:keydown={handleInputKeydown}
        />
        <button type="button" class="palette__close" on:click={closePalette} aria-label="Close">
          Esc
        </button>
      </header>

      <div class="palette__results" role="listbox" aria-label="Command results">
        {#if filtered.length === 0}
          <p class="palette__empty">No results for “{query}”. Try different keywords.</p>
        {:else}
          {#each filtered as item, index (item.id)}
            <button
              type="button"
              class:active={index === activeIndex}
              class="palette__result"
              role="option"
              aria-selected={index === activeIndex}
              on:click={() => handleNavigation(item)}
            >
              <div>
                <p class="palette__result-title">{item.title}</p>
                {#if item.description}
                  <p class="palette__result-description">{item.description}</p>
                {/if}
              </div>
              {#if item.group}
                <span class="palette__result-group">{item.group}</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .palette {
    position: fixed;
    inset: 0;
    z-index: var(--atlas-z-index-modal);
    display: grid;
    place-items: center;
  }

  .palette__backdrop {
    border: none;
    padding: 0;
    position: absolute;
    inset: 0;
    background: rgba(10, 18, 40, 0.4);
    cursor: pointer;
  }

  .palette__dialog {
    position: relative;
    width: min(620px, 92vw);
    max-height: min(520px, 90vh);
    display: grid;
    grid-template-rows: auto 1fr;
    background: var(--atlas-color-surface-default);
    border-radius: var(--atlas-radius-xl);
    border: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 65%, transparent);
    box-shadow: var(--atlas-elevation-overlay);
    overflow: hidden;
  }

  .palette__header {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: var(--atlas-space-sm);
    padding: var(--atlas-space-md);
    border-bottom: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 60%, transparent);
  }

  .palette__input {
    width: 100%;
    padding: var(--atlas-space-2xs) var(--atlas-space-sm);
    border-radius: var(--atlas-radius-lg);
    border: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 70%, transparent);
  }

  .palette__close {
    padding: var(--atlas-space-3xs) var(--atlas-space-xs);
    border-radius: var(--atlas-radius-md);
    border: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 65%, transparent);
    background: color-mix(in srgb, var(--atlas-color-surface-default) 80%, transparent);
    color: var(--atlas-color-content-secondary);
  }

  .palette__results {
    padding: var(--atlas-space-sm);
    display: grid;
    align-content: start;
    gap: var(--atlas-space-xs);
    overflow-y: auto;
  }

  .palette__result {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--atlas-space-md);
    padding: var(--atlas-space-sm) var(--atlas-space-md);
    border-radius: var(--atlas-radius-lg);
    border: 1px solid transparent;
    background: transparent;
    text-align: left;
    color: inherit;
    cursor: pointer;
  }

  .palette__result:hover,
  .palette__result:focus-visible {
    border-color: color-mix(in srgb, var(--atlas-color-border-subtle) 55%, transparent);
    background: color-mix(in srgb, var(--atlas-color-background-muted) 40%, transparent);
  }

  .palette__result.active {
    border-color: color-mix(in srgb, var(--atlas-color-accent-primary) 40%, transparent);
    background: color-mix(in srgb, var(--atlas-color-accent-primary) 16%, transparent);
    color: var(--atlas-color-accent-primary);
  }

  .palette__result-title {
    margin: 0;
    font-weight: var(--atlas-type-weight-medium);
  }

  .palette__result-description {
    margin: 0;
    color: var(--atlas-color-content-secondary);
    font-size: var(--atlas-type-scale-xs-font-size);
  }

  .palette__result-group {
    font-size: var(--atlas-type-scale-xs-font-size);
    color: var(--atlas-color-content-secondary);
  }

  .palette__empty {
    margin: 0;
    padding: var(--atlas-space-lg);
    text-align: center;
    color: var(--atlas-color-content-secondary);
  }

  @media (prefers-reduced-motion: reduce) {
    .palette__dialog {
      transition: none;
    }
  }
</style>
