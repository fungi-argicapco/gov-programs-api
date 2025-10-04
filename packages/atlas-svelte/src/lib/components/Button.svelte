<script lang="ts">
  import type { ButtonSize, ButtonVariant } from './types';

  export let type: 'button' | 'submit' | 'reset' = 'button';
  export let variant: ButtonVariant = 'primary';
  export let size: ButtonSize = 'md';
  export let loading = false;
  export let disabled = false;

  const ariaBusy = () => (loading ? 'true' : undefined);
  $: isDisabled = disabled || loading;
</script>

<button
  class="atlas-button atlas-focusable"
  class:atlas-button--loading={loading}
  data-variant={variant}
  data-size={size}
  type={type}
  disabled={isDisabled}
  aria-busy={ariaBusy()}
  {...$$restProps}
>
  {#if loading}
    <span class="atlas-button__spinner" aria-hidden="true"></span>
  {/if}
  <span class="atlas-button__content">
    <slot />
  </span>
</button>

<style>
  .atlas-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--atlas-space-sm);
    border-radius: var(--atlas-radius-pill);
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: var(--atlas-type-scale-body-font-size);
    font-weight: var(--atlas-type-weight-semibold);
    line-height: 1;
    padding: 0 var(--atlas-space-lg);
    min-height: 40px;
    cursor: pointer;
    transition:
      background-color var(--atlas-motion-duration-fast) var(--atlas-motion-easing-standard),
      color var(--atlas-motion-duration-fast) var(--atlas-motion-easing-standard),
      transform var(--atlas-motion-duration-fast) var(--atlas-motion-easing-standard),
      box-shadow var(--atlas-motion-duration-fast) var(--atlas-motion-easing-emphasized);
  }

  .atlas-button[data-size='sm'] {
    font-size: var(--atlas-type-scale-sm-font-size);
    padding: 0 var(--atlas-space-md);
    min-height: 32px;
  }

  .atlas-button[data-size='lg'] {
    font-size: var(--atlas-type-scale-lg-font-size);
    padding: 0 var(--atlas-space-xl);
    min-height: 48px;
  }

  .atlas-button[data-variant='primary'] {
    background: var(--atlas-color-accent-primary);
    color: var(--atlas-color-content-inverse);
    border-color: color-mix(in srgb, var(--atlas-color-accent-primary) 75%, transparent);
  }

  .atlas-button[data-variant='primary']:hover:not(:disabled) {
    background: color-mix(in srgb, var(--atlas-color-accent-primary) 85%, #000 10%);
  }

  .atlas-button[data-variant='secondary'] {
    background: var(--atlas-color-surface-default);
    border-color: var(--atlas-color-border-default);
    color: var(--atlas-color-content-primary);
    box-shadow: var(--atlas-elevation-raised);
  }

  .atlas-button[data-variant='secondary']:hover:not(:disabled) {
    background: color-mix(in srgb, var(--atlas-color-surface-default) 85%, var(--atlas-color-background-muted) 15%);
  }

  .atlas-button[data-variant='ghost'] {
    background: transparent;
    border-color: transparent;
    color: var(--atlas-color-content-primary);
  }

  .atlas-button[data-variant='ghost']:hover:not(:disabled) {
    background: color-mix(in srgb, var(--atlas-color-background-muted) 24%, transparent);
  }

  .atlas-button[data-variant='destructive'] {
    background: var(--atlas-color-accent-critical);
    color: var(--atlas-color-content-inverse);
    border-color: color-mix(in srgb, var(--atlas-color-accent-critical) 75%, transparent);
  }

  .atlas-button[data-variant='destructive']:hover:not(:disabled) {
    background: color-mix(in srgb, var(--atlas-color-accent-critical) 85%, #000 10%);
  }

  .atlas-button:active:not(:disabled) {
    transform: translateY(1px);
  }

  .atlas-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }

  .atlas-button__content {
    display: inline-flex;
    align-items: center;
    gap: var(--atlas-space-sm);
  }

  .atlas-button__spinner {
    width: 1em;
    height: 1em;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-top-color: transparent;
    animation: atlas-button-spin 700ms linear infinite;
  }

  .atlas-button--loading {
    cursor: progress;
  }

  .atlas-button--loading .atlas-button__content {
    opacity: 0.85;
  }

  @keyframes atlas-button-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
