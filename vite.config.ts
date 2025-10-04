import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const { sveltekit } = await import('@sveltejs/kit/vite')

  return {
    plugins: [sveltekit()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      css: true,
      globals: true,
      pool: 'threads' // avoids the fork-based hang
    }
  }
})
