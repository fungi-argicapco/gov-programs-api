#!/usr/bin/env bun
import { $ } from 'bun';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_NAME = 'gov-programs-api';
const DB_NAME = `${APP_NAME}-db`;
const R2_BUCKET_BASE = `${APP_NAME}-raw`;
const KV_LOOKUPS = 'LOOKUPS';
const KV_API_KEYS = 'API_KEYS';
const DO_CLASS = 'RateLimiter';
const DO_BINDING = 'RATE_LIMITER';
const DO_METRICS_CLASS = 'MetricsDO';
const DO_METRICS_BINDING = 'METRICS_AGG';
const TEMPLATE = 'wrangler.template.toml';
const OUTPUT = 'wrangler.toml';

const argv = new Set(process.argv.slice(2));
let mode: 'local' | 'remote' = 'remote';
if (argv.has('--local')) mode = 'local';
if (argv.has('--remote')) mode = 'remote';

const cwd = process.cwd();

function info(message: string) {
  console.log(message);
}

function ensureDirs() {
  const dirs = ['scripts', '.env.d'];
  for (const dir of dirs) {
    const full = resolve(cwd, dir);
    mkdirSync(full, { recursive: true });
  }
}

async function runInstall() {
  info('➡️ Installing runtime & dev deps with bun (no npm/pnpm/yarn)…');
  await $`bun install`;
}

async function maybeInitTsconfig() {
  const tsconfigPath = resolve(cwd, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) {
    await $`bunx tsc --init --rootDir . --outDir dist --target ES2022 --module ESNext --moduleResolution Bundler --esModuleInterop true`;
  }
  if (existsSync(tsconfigPath)) {
    try {
      const raw = readFileSync(tsconfigPath, 'utf8');
      const data = JSON.parse(raw);
      data.compilerOptions = {
        ...data.compilerOptions,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true,
        lib: ['ES2022', 'WebWorker'],
        types: ['@cloudflare/workers-types', 'vitest/globals']
      };
      data.include = Array.from(new Set([...(data.include ?? []), 'apps', 'packages', 'scripts', 'vitest.config.ts']));
      writeFileSync(tsconfigPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    } catch (error) {
      console.warn('⚠️ Unable to update tsconfig.json:', error);
    }
  }
}

async function provisionRemoteResources() {
  info('➡️ Creating Cloudflare resources via wrangler (bunx)…');
  const env = { ...process.env };
  const requireEnv = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];
  const missing = requireEnv.filter((key) => !env[key] || env[key]?.trim() === '');
  if (missing.length) {
    throw new Error(`Missing Cloudflare credentials: ${missing.join(', ')}`);
  }

  const bucketName = `${R2_BUCKET_BASE}`;
  // D1 database
  await $`bunx wrangler d1 create ${DB_NAME}`.nothrow();
  const d1ListRaw = await $`bunx wrangler d1 list --json`.text();
  const d1List = JSON.parse(d1ListRaw) as Array<{ name?: string; uuid?: string }>;
  const dbMatch = d1List.find((db) => db.name === DB_NAME);
  if (!dbMatch?.uuid) {
    throw new Error('❌ Could not determine D1 database id');
  }

  // KV namespaces
  await $`bunx wrangler kv namespace create ${KV_LOOKUPS}`.nothrow();
  await $`bunx wrangler kv namespace create ${KV_API_KEYS}`.nothrow();
  const kvListRaw = await $`bunx wrangler kv namespace list`.text();
  const kvList = JSON.parse(kvListRaw) as Array<{ title?: string; id?: string }>;
  const lookupNamespace = kvList.find((ns) => ns.title === KV_LOOKUPS);
  const apiKeysNamespace = kvList.find((ns) => ns.title === KV_API_KEYS);
  if (!lookupNamespace?.id) {
    throw new Error(`❌ Could not determine ${KV_LOOKUPS} KV id`);
  }
  if (!apiKeysNamespace?.id) {
    throw new Error(`❌ Could not determine ${KV_API_KEYS} KV id`);
  }

  // R2 bucket
  await $`bunx wrangler r2 bucket create ${bucketName}`.nothrow();

  return {
    d1Id: dbMatch.uuid,
    lookupsId: lookupNamespace.id,
    apiKeysId: apiKeysNamespace.id,
    r2Bucket: bucketName
  };
}

function writeEnv(updates: Record<string, string>) {
  info('➡️ Writing .env with resolved identifiers…');
  const envPath = resolve(cwd, '.env');
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];
  const map = new Map<string, string>();
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq);
    const value = line.slice(eq + 1);
    if (key) {
      map.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    map.set(key, value);
  }
  const serialized = Array.from(map.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  writeFileSync(envPath, serialized ? `${serialized}\n` : '', 'utf8');
  info('ℹ️  .env updated: CF_* IDs available to scripts & tests.');
}

function renderWranglerToml(envValues: Record<string, string>) {
  info('➡️ Rendering wrangler.toml from template…');
  const templatePath = resolve(cwd, TEMPLATE);
  const outputPath = resolve(cwd, OUTPUT);
  if (!existsSync(templatePath)) {
    const template = `name = "${APP_NAME}"
main = "apps/api/src/index.ts"
compatibility_date = "2025-09-21"

[vars]
NODE_ENV = "production"

[[d1_databases]]
binding = "DB"
database_name = "${DB_NAME}"
database_id = "__D1_DATABASE_ID__"

[[kv_namespaces]]
binding = "LOOKUPS_KV"
id = "__KV_LOOKUPS_ID__"

[[kv_namespaces]]
binding = "API_KEYS"
id = "__KV_API_KEYS_ID__"

[[r2_buckets]]
binding = "RAW_R2"
bucket_name = "__R2_BUCKET__"

[[durable_objects.bindings]]
name = "__DO_BINDING__"
class_name = "__DO_CLASS__"

[[migrations]]
tag = "v1"
new_classes = ["__DO_CLASS__"]

[migrations]
dir = "packages/db/migrations"

[triggers]
crons = ["0 */4 * * *"]
`;
    writeFileSync(templatePath, template, 'utf8');
  }
  const replacements = new Map<string, string>([
    ['__D1_DATABASE_ID__', envValues.CF_D1_DATABASE_ID ?? ''],
    ['__KV_LOOKUPS_ID__', envValues.CF_KV_LOOKUPS_ID ?? ''],
    ['__KV_API_KEYS_ID__', envValues.CF_KV_API_KEYS_ID ?? ''],
    ['__R2_BUCKET__', envValues.CF_R2_RAW_BUCKET ?? ''],
    ['__DO_BINDING__', envValues.CF_DO_BINDING ?? ''],
    ['__DO_CLASS__', envValues.CF_DO_CLASS ?? ''],
    ['__DO_METRICS_BINDING__', envValues.CF_DO_METRICS_BINDING ?? ''],
    ['__DO_METRICS_CLASS__', envValues.CF_DO_METRICS_CLASS ?? '']
  ]);
  const templateContents = readFileSync(templatePath, 'utf8');
  let output = templateContents;
  for (const [token, value] of replacements) {
    output = output.replaceAll(token, value);
  }
  writeFileSync(outputPath, output, 'utf8');
  info(`✅ Generated ${OUTPUT}`);
}

async function main() {
  ensureDirs();
  await runInstall();
  await maybeInitTsconfig();

  let envValues: Record<string, string>;

  if (mode === 'local') {
    info('➡️ Local mode: skipping Cloudflare resource creation.');
    envValues = {
      CF_D1_DATABASE_ID: 'local',
      CF_KV_LOOKUPS_ID: 'local',
      CF_KV_API_KEYS_ID: 'local',
      CF_R2_RAW_BUCKET: `${R2_BUCKET_BASE}-local`,
      CF_DO_BINDING: DO_BINDING,
      CF_DO_CLASS: DO_CLASS,
      CF_DO_METRICS_BINDING: DO_METRICS_BINDING,
      CF_DO_METRICS_CLASS: DO_METRICS_CLASS
    };
  } else {
    const remote = await provisionRemoteResources();
    envValues = {
      CF_D1_DATABASE_ID: remote.d1Id,
      CF_KV_LOOKUPS_ID: remote.lookupsId,
      CF_KV_API_KEYS_ID: remote.apiKeysId,
      CF_R2_RAW_BUCKET: remote.r2Bucket,
      CF_DO_BINDING: DO_BINDING,
      CF_DO_CLASS: DO_CLASS,
      CF_DO_METRICS_BINDING: DO_METRICS_BINDING,
      CF_DO_METRICS_CLASS: DO_METRICS_CLASS
    };
  }

  writeEnv(envValues);
  renderWranglerToml(envValues);

  info('🔐 (Optional) set secrets via wrangler:');
  info('   echo $OPENAI_API_KEY | bunx wrangler secret put OPENAI_API_KEY');
  info('   echo $GITHUB_TOKEN   | bunx wrangler secret put GITHUB_TOKEN');
  info('🎉 Setup complete.');
}

main().catch((error) => {
  console.error('❌ Setup failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
