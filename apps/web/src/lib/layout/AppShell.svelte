<script lang="ts">
  import { page } from '$app/stores';
import { goto } from '$app/navigation';
  import TopBar from '$lib/components/TopBar.svelte';
  import SideNav from '$lib/components/SideNav.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import { NAV_ITEMS, PALETTE_ITEMS } from '$lib/data/nav';

  let navOpen = false;
  let paletteOpen = false;
  let paletteQuery = '';
  let lastPathname = '';

  $: currentPathname = $page.url.pathname;
  $: if (currentPathname !== lastPathname) {
    navOpen = false;
    paletteOpen = false;
    paletteQuery = '';
    lastPathname = currentPathname;
  }

  function handleNavToggle() {
    navOpen = !navOpen;
  }

  function handleNavNavigate(event: CustomEvent<{ href: string }>) {
    navOpen = false;
    goto(event.detail.href);
  }

  function handleSearch(event: CustomEvent<{ query: string }>) {
    paletteQuery = event.detail.query;
    paletteOpen = true;
  }
</script>

<div class="app-shell">
  <TopBar on:toggle-nav={handleNavToggle} on:search={handleSearch} title="TechLand Atlas" />

  <div class="app-shell__body">
    <SideNav
      items={NAV_ITEMS}
      currentPath={currentPathname}
      open={navOpen}
      on:navigate={handleNavNavigate}
    />

    {#if navOpen}
      <div class="app-shell__overlay" aria-hidden="true" on:click={() => (navOpen = false)} />
    {/if}

    <main class="app-shell__main" tabindex="-1">
      <slot />
    </main>
  </div>

  <CommandPalette bind:open={paletteOpen} bind:query={paletteQuery} items={PALETTE_ITEMS} on:close={() => (paletteQuery = '')} />
</div>

<style>
  .app-shell {
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
    background: var(--atlas-color-background-canvas);
    color: var(--atlas-color-content-primary);
  }

  .app-shell__body {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0;
    padding: var(--atlas-space-lg) var(--atlas-space-2xl) var(--atlas-space-xl);
  }

  .app-shell__main {
    padding: 0 var(--atlas-space-xl);
    display: grid;
    align-content: start;
    gap: var(--atlas-space-xl);
  }

  .app-shell__overlay {
    display: none;
  }

  @media (max-width: 1080px) {
    .app-shell__body {
      grid-template-columns: 1fr;
      padding: var(--atlas-space-md);
    }

    .app-shell__main {
      padding: 0;
    }

    .app-shell__overlay {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(9, 13, 30, 0.35);
      z-index: calc(var(--atlas-z-index-modal) - 1);
    }
  }
</style>
