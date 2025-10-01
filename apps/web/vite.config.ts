import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const API_PROXY_TARGET = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8787';

export default defineConfig({
  root: rootDir,
  publicDir: resolve(rootDir, 'public'),
  plugins: [svelte()],
  build: {
    outDir: resolve(rootDir, 'dist'),
    assetsDir: 'assets',
    emptyOutDir: true,
    target: 'es2022'
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/v1': API_PROXY_TARGET,
      '/admin': API_PROXY_TARGET,
      '/docs': API_PROXY_TARGET,
      '/openapi.json': API_PROXY_TARGET
    }
  }
});
