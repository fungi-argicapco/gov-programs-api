<script lang="ts">
  import type { CardPadding, CardVariant } from './types';

  export let as: 'div' | 'article' | 'section' | 'aside' = 'div';
  export let variant: CardVariant = 'raised';
  export let padding: CardPadding = 'md';
  export let interactive = false;

  $: baseClass = 'atlas-card atlas-surface';
  $: interactiveClass = interactive ? ' atlas-card--interactive' : '';
</script>

<svelte:element
  this={as}
  class={`${baseClass}${interactiveClass}`}
  data-variant={variant}
  data-padding={padding}
  {...$$restProps}
>
  <slot />
</svelte:element>

<style>
  .atlas-card {
    display: flex;
    flex-direction: column;
    gap: var(--atlas-space-md);
    border-radius: var(--atlas-radius-lg);
    background: var(--atlas-color-surface-default);
    border: 1px solid var(--atlas-color-border-subtle);
    color: var(--atlas-color-content-primary);
    box-shadow: var(--atlas-elevation-raised);
    transition:
      box-shadow var(--atlas-motion-duration-fast) var(--atlas-motion-easing-emphasized),
      transform var(--atlas-motion-duration-fast) var(--atlas-motion-easing-standard),
      border-color var(--atlas-motion-duration-fast) var(--atlas-motion-easing-standard);
  }

  .atlas-card[data-variant='outline'] {
    box-shadow: none;
    border-color: var(--atlas-color-border-default);
    background: var(--atlas-color-background-inset);
  }

  .atlas-card[data-variant='muted'] {
    border-color: color-mix(in srgb, var(--atlas-color-border-subtle) 60%, transparent);
    background: color-mix(in srgb, var(--atlas-color-background-muted) 70%, var(--atlas-color-background-inset) 30%);
    box-shadow: none;
  }

  .atlas-card[data-padding='sm'] {
    padding: var(--atlas-space-md);
  }

  .atlas-card[data-padding='md'] {
    padding: var(--atlas-space-lg);
  }

  .atlas-card[data-padding='lg'] {
    padding: var(--atlas-space-xl);
  }

  .atlas-card--interactive {
    cursor: pointer;
  }

  .atlas-card--interactive:hover {
    transform: translateY(-2px);
    box-shadow: var(--atlas-elevation-overlay);
  }

  .atlas-card--interactive:active {
    transform: translateY(1px);
    box-shadow: var(--atlas-elevation-raised);
  }
</style>
