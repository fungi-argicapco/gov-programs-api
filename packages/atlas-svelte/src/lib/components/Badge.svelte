<script lang="ts">
  import type { BadgeTone, BadgeVariant } from './types';

  export let variant: BadgeVariant = 'neutral';
  export let tone: BadgeTone = 'solid';
</script>

<span class="atlas-badge" data-variant={variant} data-tone={tone} {...$$restProps}>
  <slot />
</span>

<style>
  .atlas-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--atlas-space-2xs);
    padding: 0 var(--atlas-space-sm);
    border-radius: var(--atlas-radius-pill);
    font-size: var(--atlas-type-scale-sm-font-size);
    font-weight: var(--atlas-type-weight-medium);
    line-height: 1.4;
    letter-spacing: var(--atlas-type-letter-spacing-tight);
    border: 1px solid transparent;
    white-space: nowrap;
  }

  .atlas-badge[data-tone='solid'][data-variant='neutral'] {
    background: var(--atlas-color-content-muted);
    color: var(--atlas-color-content-inverse);
    border-color: transparent;
  }

  .atlas-badge[data-tone='soft'][data-variant='neutral'] {
    background: color-mix(in srgb, var(--atlas-color-border-subtle) 35%, transparent);
    color: var(--atlas-color-content-secondary);
    border-color: color-mix(in srgb, var(--atlas-color-border-subtle) 55%, transparent);
  }

  .atlas-badge[data-tone='solid'][data-variant='primary'] {
    background: color-mix(in srgb, var(--atlas-color-accent-primary) 90%, transparent);
    color: var(--atlas-color-content-inverse);
    border-color: color-mix(in srgb, var(--atlas-color-accent-primary) 70%, transparent);
  }

  .atlas-badge[data-tone='soft'][data-variant='primary'] {
    background: color-mix(in srgb, var(--atlas-color-accent-primary) 18%, transparent);
    color: var(--atlas-color-accent-primary);
    border-color: color-mix(in srgb, var(--atlas-color-accent-primary) 30%, transparent);
  }

  .atlas-badge[data-tone='solid'][data-variant='positive'] {
    background: color-mix(in srgb, var(--atlas-color-accent-positive) 90%, transparent);
    color: var(--atlas-color-content-inverse);
    border-color: color-mix(in srgb, var(--atlas-color-accent-positive) 70%, transparent);
  }

  .atlas-badge[data-tone='soft'][data-variant='positive'] {
    background: color-mix(in srgb, var(--atlas-color-accent-positive) 18%, transparent);
    color: var(--atlas-color-accent-positive);
    border-color: color-mix(in srgb, var(--atlas-color-accent-positive) 35%, transparent);
  }

  .atlas-badge[data-tone='solid'][data-variant='warning'] {
    background: color-mix(in srgb, var(--atlas-color-accent-warning) 85%, transparent);
    color: var(--atlas-color-content-primary);
    border-color: color-mix(in srgb, var(--atlas-color-accent-warning) 60%, transparent);
  }

  .atlas-badge[data-tone='soft'][data-variant='warning'] {
    background: color-mix(in srgb, var(--atlas-color-accent-warning) 20%, transparent);
    color: var(--atlas-color-accent-warning);
    border-color: color-mix(in srgb, var(--atlas-color-accent-warning) 30%, transparent);
  }

  .atlas-badge[data-tone='solid'][data-variant='critical'] {
    background: color-mix(in srgb, var(--atlas-color-accent-critical) 90%, transparent);
    color: var(--atlas-color-content-inverse);
    border-color: color-mix(in srgb, var(--atlas-color-accent-critical) 70%, transparent);
  }

  .atlas-badge[data-tone='soft'][data-variant='critical'] {
    background: color-mix(in srgb, var(--atlas-color-accent-critical) 18%, transparent);
    color: var(--atlas-color-accent-critical);
    border-color: color-mix(in srgb, var(--atlas-color-accent-critical) 35%, transparent);
  }

  .atlas-badge[data-tone='solid'][data-variant='info'] {
    background: color-mix(in srgb, var(--atlas-color-accent-info) 90%, transparent);
    color: var(--atlas-color-content-inverse);
    border-color: color-mix(in srgb, var(--atlas-color-accent-info) 70%, transparent);
  }

  .atlas-badge[data-tone='soft'][data-variant='info'] {
    background: color-mix(in srgb, var(--atlas-color-accent-info) 18%, transparent);
    color: var(--atlas-color-accent-info);
    border-color: color-mix(in srgb, var(--atlas-color-accent-info) 35%, transparent);
  }
</style>
