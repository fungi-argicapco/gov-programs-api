<script lang="ts" context="module">
  let idSequence = 0;
  export function createModalId(prefix: string) {
    idSequence += 1;
    return `${prefix}-${idSequence}`;
  }
</script>

<script lang="ts">
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import type { ModalSize } from './types';
  declare const $$slots: Record<string, unknown>;

  export let open = false;
  export let size: ModalSize = 'md';
  export let title: string | undefined = undefined;
  export let description: string | undefined = undefined;
  export let labelledBy: string | undefined = undefined;
  export let closeOnBackdrop = true;
  export let dismissible = true;

  const dispatch = createEventDispatcher<{ close: void }>();
  const fallbackTitleId = createModalId('atlas-modal-title');
  const fallbackDescriptionId = createModalId('atlas-modal-desc');

  const hasHeaderSlot = Boolean($$slots.header);
  const hasFooterSlot = Boolean($$slots.footer);

  const isBrowser = typeof document !== 'undefined';

  let container: HTMLDivElement | null = null;
  let previouslyFocused: HTMLElement | null = null;

  $: titleId = labelledBy ?? (title ? fallbackTitleId : undefined);
  $: descriptionId = description ? fallbackDescriptionId : undefined;

  function close() {
    if (!dismissible || !open) return;
    open = false;
    dispatch('close');
  }

  function handleBackdropClick(event: MouseEvent) {
    if (!closeOnBackdrop || !dismissible) return;
    if (event.target === event.currentTarget) {
      close();
    }
  }

  function trapFocus(event: KeyboardEvent) {
    if (!container) return;
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );

    if (focusable.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      close();
      return;
    }

    if (event.key === 'Tab') {
      trapFocus(event);
    }
  }

  async function lockFocus() {
    if (!isBrowser) return;
    previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.setProperty('overflow', 'hidden');
    await tick();
    container?.focus({ preventScroll: true });
  }

  function restoreFocus() {
    if (!isBrowser) return;
    document.body.style.removeProperty('overflow');
    previouslyFocused?.focus({ preventScroll: true });
    previouslyFocused = null;
  }

  $: if (open) {
    lockFocus();
  } else {
    restoreFocus();
  }

  onDestroy(() => {
    restoreFocus();
  });
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div class="atlas-modal__backdrop" role="presentation" on:click={handleBackdropClick}>
    <div
      class="atlas-modal"
      class:atlas-modal--sm={size === 'sm'}
      class:atlas-modal--lg={size === 'lg'}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabindex="-1"
      on:keydown={handleKeydown}
      bind:this={container}
    >
      <div class="atlas-modal__surface atlas-surface">
        {#if hasHeaderSlot || title}
          <header class="atlas-modal__header">
            <slot name="header">
              {#if title}
                <h2 id={titleId} class="atlas-modal__title">{title}</h2>
              {/if}
            </slot>
            {#if dismissible}
              <button class="atlas-modal__close atlas-focusable" type="button" on:click={close} aria-label="Close dialog">
                ×
              </button>
            {/if}
          </header>
        {/if}
        <div class="atlas-modal__body" id={descriptionId}>
          {#if description}
            <p class="atlas-modal__description">{description}</p>
          {/if}
          <slot />
        </div>
        {#if hasFooterSlot}
          <footer class="atlas-modal__footer">
            <slot name="footer"></slot>
          </footer>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .atlas-modal__backdrop {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--atlas-color-surface-overlay) 70%, transparent);
    padding: var(--atlas-space-xl);
    z-index: var(--atlas-z-index-modal);
  }

  .atlas-modal {
    max-width: min(720px, 100%);
    width: 100%;
    outline: none;
  }

  .atlas-modal--sm {
    max-width: 420px;
  }

  .atlas-modal--lg {
    max-width: min(960px, 100%);
  }

  .atlas-modal__surface {
    border-radius: var(--atlas-radius-xl);
    box-shadow: var(--atlas-elevation-overlay);
    background: var(--atlas-color-surface-default);
    color: var(--atlas-color-content-primary);
    display: grid;
    gap: var(--atlas-space-lg);
    padding: var(--atlas-space-xl);
    position: relative;
  }

  .atlas-modal__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--atlas-space-md);
  }

  .atlas-modal__title {
    margin: 0;
    font-size: var(--atlas-type-scale-xl-font-size);
    line-height: var(--atlas-type-scale-xl-line-height);
    font-weight: var(--atlas-type-weight-semibold);
  }

  .atlas-modal__close {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--atlas-color-content-muted);
    font-size: 1.5rem;
    line-height: 1;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--atlas-radius-md);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background-color var(--atlas-motion-duration-fast) var(--atlas-motion-easing-standard);
  }

  .atlas-modal__close:hover {
    background: color-mix(in srgb, var(--atlas-color-background-muted) 20%, transparent);
  }

  .atlas-modal__body {
    display: grid;
    gap: var(--atlas-space-md);
    max-height: min(70vh, 640px);
    overflow-y: auto;
  }

  .atlas-modal__description {
    margin: 0;
    color: var(--atlas-color-content-secondary);
  }

  .atlas-modal__footer {
    display: flex;
    flex-wrap: wrap;
    gap: var(--atlas-space-sm);
    justify-content: flex-end;
  }

  @media (max-width: 720px) {
    .atlas-modal__surface {
      padding: var(--atlas-space-lg);
    }

    .atlas-modal__body {
      max-height: 70vh;
    }
  }
</style>
