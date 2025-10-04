<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export type SideNavItem = {
    label: string;
    href: string;
    icon?: string;
    description?: string;
  };

  export let items: SideNavItem[] = [];
  export let currentPath = '/';
  export let open = true;

  const dispatch = createEventDispatcher<{ navigate: { href: string } }>();

  function isActive(href: string): boolean {
    if (href === '/') return currentPath === '/';
    return currentPath === href || currentPath.startsWith(`${href}/`);
  }
</script>

<nav class:side-nav--open={open} class="side-nav" aria-label="Primary">
  <ul class="side-nav__list">
    {#each items as item (item.href)}
      <li>
        <a
          href={item.href}
          class:active={isActive(item.href)}
          class="side-nav__link atlas-focusable"
          aria-current={isActive(item.href) ? 'page' : undefined}
          on:click|preventDefault={() => dispatch('navigate', { href: item.href })}
        >
          <span class="side-nav__icon" aria-hidden="true">{item.icon ?? '•'}</span>
          <span class="side-nav__content">
            <span class="side-nav__label">{item.label}</span>
            {#if item.description}
              <span class="side-nav__description">{item.description}</span>
            {/if}
          </span>
        </a>
      </li>
    {/each}
  </ul>
</nav>

<style>
  .side-nav {
    position: sticky;
    top: 0;
    align-self: start;
    display: grid;
    width: 260px;
    max-height: calc(100vh - var(--atlas-space-3xl));
    padding: var(--atlas-space-lg) var(--atlas-space-sm);
    background: color-mix(in srgb, var(--atlas-color-surface-default) 92%, transparent);
    border-right: 1px solid color-mix(in srgb, var(--atlas-color-border-subtle) 60%, transparent);
    overflow-y: auto;
  }

  .side-nav__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--atlas-space-2xs);
  }

  .side-nav__link {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--atlas-space-sm);
    padding: var(--atlas-space-sm);
    border-radius: var(--atlas-radius-lg);
    text-decoration: none;
    color: inherit;
    border: 1px solid transparent;
    background: transparent;
    transition: background var(--atlas-motion-duration-fast) var(--atlas-motion-easing-standard);
  }

  .side-nav__link:hover,
  .side-nav__link:focus-visible {
    background: color-mix(in srgb, var(--atlas-color-surface-default) 80%, transparent);
  }

  .side-nav__link.active {
    border-color: color-mix(in srgb, var(--atlas-color-accent-primary) 40%, transparent);
    background: color-mix(in srgb, var(--atlas-color-accent-primary) 14%, transparent);
    color: var(--atlas-color-accent-primary);
    font-weight: var(--atlas-type-weight-medium);
  }

  .side-nav__icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--atlas-radius-pill);
    background: color-mix(in srgb, var(--atlas-color-background-muted) 70%, transparent);
    font-size: 0.9rem;
  }

  .side-nav__content {
    display: grid;
    gap: var(--atlas-space-3xs);
  }

  .side-nav__label {
    font-size: var(--atlas-type-scale-sm-font-size);
  }

  .side-nav__description {
    font-size: var(--atlas-type-scale-xs-font-size);
    color: var(--atlas-color-content-secondary);
  }

  @media (max-width: 1080px) {
    .side-nav {
      position: fixed;
      inset: 0;
      width: min(320px, 92vw);
      transform: translateX(-100%);
      transition: transform var(--atlas-motion-duration-fast) var(--atlas-motion-easing-emphasized);
      box-shadow: var(--atlas-elevation-overlay);
      z-index: var(--atlas-z-index-modal);
    }

    .side-nav--open {
      transform: translateX(0);
    }
  }
</style>
