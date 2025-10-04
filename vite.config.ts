import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

if (process.env.VITEST) {
  const originalWarn = console.warn

  console.warn = (...args: unknown[]) => {
    const message = typeof args[0] === 'string' ? args[0] : ''

    if (
      message.includes('Your tsconfig.json should extend') ||
      message.includes('./apps/web/.svelte-kit/tsconfig.json')
    ) {
      return
    }

    originalWarn(...args)
  }
}

const repoRoot = process.cwd()
const webRoot = resolve(repoRoot, 'apps/web')
const hasWebSvelteConfig = ['svelte.config.ts', 'svelte.config.js'].some((file) =>
  existsSync(resolve(webRoot, file))
)

function createAlias(find: string, target: string) {
  const resolved = resolve(repoRoot, target)

  return [
    { find, replacement: resolved },
    { find: `${find}/`, replacement: `${resolved}/` }
  ]
}

export default defineConfig(async () => {
  const plugins = []

  if (hasWebSvelteConfig) {
    const { sveltekit } = await import('@sveltejs/kit/vite')
    const previousCwd = process.cwd()

    try {
      // temporarily align cwd so SvelteKit loads the web app config instead of the repo root
      process.chdir(webRoot)
      plugins.push(...(await sveltekit()))
    } finally {
      process.chdir(previousCwd)
    }
  }

  return {
    plugins,
    resolve: {
      alias: [
        ...createAlias('@common', 'packages/common/src'),
        ...createAlias('@db', 'packages/db/src'),
        ...createAlias('@ml', 'packages/ml/src'),
        ...createAlias('@atlas/svelte', 'packages/atlas-svelte/src/lib'),
        ...createAlias('@atlas/components', 'packages/atlas-svelte/src/lib/components'),
        { find: '@atlas/tokens', replacement: resolve(repoRoot, 'packages/atlas-tokens/tokens.json') },
        { find: '@atlas/tokens/', replacement: resolve(repoRoot, 'packages/atlas-tokens/') }
      ]
    },
    test: {
      environment: 'happy-dom',
      setupFiles: ['./vitest.setup.ts'],
      css: true,
      globals: true,
      pool: 'threads',
      onConsoleLog(log, type) {
        if (type === 'stderr' && log.includes('Your tsconfig.json should extend')) {
          return false
        }

        if (log.includes('Skipping suppression persistence because DB binding is missing.')) {
          return false
        }
      }
    }
  }
})
