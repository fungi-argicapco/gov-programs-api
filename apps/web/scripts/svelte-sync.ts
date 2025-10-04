import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { patchNodeVersion } from './node-version';

patchNodeVersion();

const args = process.argv.slice(2);

process.argv = ['bun', 'svelte-kit', 'sync', ...args];

const here = dirname(fileURLToPath(import.meta.url));
const cliEntry = pathToFileURL(resolve(here, '../../../node_modules/@sveltejs/kit/src/cli.js')).href;

await import(cliEntry);
