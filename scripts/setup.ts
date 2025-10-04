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
const LOCAL_ENV_FILE = '.env.dev.local';
const PROD_ENV_FILE = '.env';
const REQUIRED_APP_VARS = ['PROGRAM_API_BASE', 'EMAIL_ADMIN', 'EMAIL_SENDER'] as const;
const OPTIONAL_APP_VARS = ['SESSION_COOKIE_NAME', 'MFA_ISSUER', 'ALERTS_MAX_DELIVERY_ATTEMPTS'] as const;

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

async function buildWebAssets() {
  const tokensDir = resolve(cwd, 'packages/atlas-tokens');
  if (existsSync(tokensDir)) {
    info('➡️ Building Atlas tokens…');
    await $`bun run --cwd ${tokensDir} build`;
  }
  info('➡️ Refreshing dataset bundles…');
  await $`bun run datasets:build`;
  info('➡️ Building frontend assets (apps/web)…');
  await $`bun run web:build`;
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
        lib: ['ES2022', 'WebWorker', 'DOM'],
        types: ['@cloudflare/workers-types', 'vitest/globals']
      };
      data.include = Array.from(new Set([...(data.include ?? []), 'apps', 'packages', 'scripts', 'vitest.config.ts']));
      writeFileSync(tsconfigPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    } catch (error) {
      console.warn('⚠️ Unable to update tsconfig.json:', error);
    }
  }
}

type D1ListItem = { name?: string; uuid?: string };
type KvNamespace = { title?: string; id?: string };
type R2Bucket = { name?: string };

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

function cfHeaders(apiToken: string) {
  return {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
  } satisfies HeadersInit;
}

async function listD1Databases(): Promise<D1ListItem[]> {
  try {
    const raw = await $`bunx wrangler d1 list --json`.text();
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as D1ListItem[]) : [];
  } catch (error) {
    console.warn('⚠️ Unable to list D1 databases:', error);
    return [];
  }
}

async function ensureD1Database(): Promise<string> {
  const existing = (await listD1Databases()).find((db) => db.name === DB_NAME && db.uuid);
  if (existing?.uuid) {
    info(`ℹ️ D1 database already present: ${existing.uuid}`);
    return existing.uuid;
  }
  info(`➡️ Creating D1 database ${DB_NAME}…`);
  await $`bunx wrangler d1 create ${DB_NAME}`;
  const created = (await listD1Databases()).find((db) => db.name === DB_NAME && db.uuid);
  if (!created?.uuid) {
    throw new Error('❌ Could not determine D1 database id after creation');
  }
  return created.uuid;
}

async function listKvNamespaces(accountId: string, apiToken: string): Promise<KvNamespace[]> {
  const namespaces: KvNamespace[] = [];
  let page = 1;
  const headers = cfHeaders(apiToken);

  while (true) {
    const url = `${CF_API_BASE}/accounts/${accountId}/storage/kv/namespaces?page=${page}&per_page=100`;
    const response = await fetch(url, { headers });
    const body = (await response.json()) as {
      success: boolean;
      result?: KvNamespace[];
      result_info?: { total_pages?: number };
      errors?: Array<{ message?: string }>;
    };
    if (!response.ok || !body.success || !body.result) {
      const reason = body.errors?.map((err) => err.message).join(', ') ?? response.statusText;
      throw new Error(`Failed to list KV namespaces: ${reason}`);
    }
    namespaces.push(...body.result);
    const totalPages = body.result_info?.total_pages ?? 1;
    if (page >= totalPages) {
      break;
    }
    page += 1;
  }

  return namespaces;
}

async function ensureKvNamespace(title: string, accountId: string, apiToken: string): Promise<string> {
  let namespaces = await listKvNamespaces(accountId, apiToken);
  let existing = namespaces.find((ns) => ns.title === title && ns.id);
  if (existing?.id) {
    info(`ℹ️ KV namespace already present for ${title}: ${existing.id}`);
    return existing.id;
  }

  info(`➡️ Creating KV namespace ${title}…`);
  const response = await fetch(`${CF_API_BASE}/accounts/${accountId}/storage/kv/namespaces`, {
    method: 'POST',
    headers: cfHeaders(apiToken),
    body: JSON.stringify({ title })
  });
  const body = (await response.json()) as {
    success: boolean;
    result?: KvNamespace;
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || !body.success) {
    if (body.errors?.some((err) => err.message?.includes('already exists'))) {
      namespaces = await listKvNamespaces(accountId, apiToken);
      existing = namespaces.find((ns) => ns.title === title && ns.id);
      if (existing?.id) {
        info(`ℹ️ KV namespace already present for ${title}: ${existing.id}`);
        return existing.id;
      }
    }
    const reason = body.errors?.map((err) => err.message).join(', ') ?? response.statusText;
    throw new Error(`Failed to create KV namespace ${title}: ${reason}`);
  }

  if (body.result?.id) {
    return body.result.id;
  }

  namespaces = await listKvNamespaces(accountId, apiToken);
  existing = namespaces.find((ns) => ns.title === title && ns.id);
  if (!existing?.id) {
    throw new Error(`❌ Could not determine ${title} KV namespace id after creation`);
  }
  return existing.id;
}

async function listR2Buckets(accountId: string, apiToken: string): Promise<R2Bucket[]> {
  const response = await fetch(`${CF_API_BASE}/accounts/${accountId}/r2/buckets`, {
    headers: cfHeaders(apiToken)
  });
  const body = (await response.json()) as {
    success: boolean;
    result?: R2Bucket[] | { buckets?: R2Bucket[] };
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || !body.success || !body.result) {
    const reason = body.errors?.map((err) => err.message).join(', ') ?? response.statusText;
    throw new Error(`Failed to list R2 buckets: ${reason}`);
  }
  if (Array.isArray(body.result)) {
    return body.result;
  }
  if (Array.isArray(body.result.buckets)) {
    return body.result.buckets;
  }
  return [];
}

async function ensureR2Bucket(name: string, accountId: string, apiToken: string): Promise<string> {
  const buckets = await listR2Buckets(accountId, apiToken);
  const existing = buckets.find((bucket) => bucket.name === name);
  if (existing) {
    info(`ℹ️ R2 bucket already present: ${name}`);
    return name;
  }

  info(`➡️ Creating R2 bucket ${name}…`);
  const response = await fetch(`${CF_API_BASE}/accounts/${accountId}/r2/buckets`, {
    method: 'POST',
    headers: cfHeaders(apiToken),
    body: JSON.stringify({ name })
  });
  const body = (await response.json()) as {
    success: boolean;
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || !body.success) {
    if (body.errors?.some((err) => err.message?.includes('already exists'))) {
      info(`ℹ️ R2 bucket already present: ${name}`);
      return name;
    }
    const reason = body.errors?.map((err) => err.message).join(', ') ?? response.statusText;
    throw new Error(`Failed to create R2 bucket ${name}: ${reason}`);
  }

  return name;
}

async function provisionRemoteResources() {
  info('➡️ Creating Cloudflare resources via wrangler (bunx)…');
  const env = { ...process.env };
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !apiToken) {
    throw new Error('Missing Cloudflare credentials: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required');
  }

  const bucketName = `${R2_BUCKET_BASE}`;

  const d1Id = await ensureD1Database();
  const lookupsId = await ensureKvNamespace(KV_LOOKUPS, accountId, apiToken);
  const apiKeysId = await ensureKvNamespace(KV_API_KEYS, accountId, apiToken);
  await ensureR2Bucket(bucketName, accountId, apiToken);

  return {
    d1Id,
    lookupsId,
    apiKeysId,
    r2Bucket: bucketName
  };
}

function loadEnvMap(envPath: string): Map<string, string> {
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
  return map;
}

function writeEnv(updates: Record<string, string>, targetFile: string, options?: { ensureKeys?: readonly string[] }) {
  info(`➡️ Writing ${targetFile} with resolved identifiers…`);
  const envPath = resolve(cwd, targetFile);
  const map = loadEnvMap(envPath);

  for (const [key, value] of Object.entries(updates)) {
    map.set(key, value);
  }

  if (options?.ensureKeys) {
    for (const key of options.ensureKeys) {
      if (!map.has(key)) {
        map.set(key, '');
      }
    }
  }

  const serialized = Array.from(map.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  writeFileSync(envPath, serialized ? `${serialized}\n` : '', 'utf8');
  info(`ℹ️  ${targetFile} updated: CF_* IDs available to scripts & tests.`);
}

function warnMissingAppVars(targetFile: string) {
  const envPath = resolve(cwd, targetFile);
  if (!existsSync(envPath)) return;
  const map = loadEnvMap(envPath);
  const missingRequired = REQUIRED_APP_VARS.filter((key) => {
    const value = map.get(key)?.trim();
    return !value;
  });
  if (missingRequired.length > 0) {
    console.warn(`⚠️ Missing required application vars in ${targetFile}: ${missingRequired.join(', ')}`);
  }
  const missingOptional = OPTIONAL_APP_VARS.filter((key) => !map.has(key));
  if (missingOptional.length > 0) {
    console.warn(`ℹ️ Optional vars can be configured in ${targetFile}: ${missingOptional.join(', ')}`);
  }
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
    ['__DO_METRICS_CLASS__', envValues.CF_DO_METRICS_CLASS ?? ''],
    ['__EMAIL_PROVIDER__', process.env.EMAIL_PROVIDER?.trim() ?? 'console'],
    ['__EMAIL_SENDER__', process.env.EMAIL_SENDER?.trim() ?? ''],
    ['__EMAIL_ADMIN__', process.env.EMAIL_ADMIN?.trim() ?? ''],
    ['__PROGRAM_API_BASE__', process.env.PROGRAM_API_BASE?.trim() ?? ''],
    ['__POSTMARK_MESSAGE_STREAM__', process.env.POSTMARK_MESSAGE_STREAM?.trim() ?? 'outbound']
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
  await buildWebAssets();

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

  const envTarget = mode === 'local' ? LOCAL_ENV_FILE : PROD_ENV_FILE;
  const ensureKeys = [...REQUIRED_APP_VARS, ...OPTIONAL_APP_VARS];
  writeEnv(envValues, envTarget, { ensureKeys });
  warnMissingAppVars(envTarget);
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
