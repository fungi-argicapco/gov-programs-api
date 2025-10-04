#!/usr/bin/env bun
/// <reference types="bun-types" />
import { $ } from 'bun';

const env = process.env;
const accountId = env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = env.CLOUDFLARE_API_TOKEN;
const zoneId = env.CLOUDFLARE_ZONE_ID;
const customDomain = env.CUSTOM_DOMAIN ?? 'program.fungiagricap.com';
const dnsType = env.CUSTOM_DOMAIN_DNS_TYPE ?? 'CNAME';
const dnsTarget = env.CUSTOM_DOMAIN_TARGET ?? 'workers.dev';
const proxied = env.CUSTOM_DOMAIN_PROXIED ? env.CUSTOM_DOMAIN_PROXIED !== '0' && env.CUSTOM_DOMAIN_PROXIED.toLowerCase() !== 'false' : true;

function requireEnv(name: string, value: string | undefined) {
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

async function ensureDnsRecord(): Promise<void> {
  const zone = requireEnv('CLOUDFLARE_ZONE_ID', zoneId);
  const token = requireEnv('CLOUDFLARE_API_TOKEN', apiToken);
  const name = customDomain.trim();
  if (!name) {
    throw new Error('CUSTOM_DOMAIN must not be empty when managing DNS records.');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  } satisfies HeadersInit;

  const baseUrl = `https://api.cloudflare.com/client/v4/zones/${zone}/dns_records`;
  const listUrl = `${baseUrl}?name=${encodeURIComponent(name)}&match=all&per_page=1`;

  const listResponse = await fetch(listUrl, { headers });
  const listBody = await listResponse.json() as {
    success: boolean;
    result?: Array<{ id: string; type: string; content: string; proxied?: boolean }>;
    errors?: Array<{ message: string }>;
  };

  if (!listResponse.ok || !listBody.success) {
    const reason = listBody.errors?.map((err) => err.message).join(', ') ?? listResponse.statusText;
    throw new Error(`Failed to query DNS records for ${name}: ${reason}`);
  }

  if (listBody.result && listBody.result.length > 0) {
    const record = listBody.result[0];
    console.log(`ℹ️  DNS record already exists for ${name}:`, record);
    return;
  }

  const payload = {
    type: dnsType,
    name,
    content: dnsTarget,
    proxied,
    ttl: 1
  };

  const createResponse = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const createBody = await createResponse.json() as {
    success: boolean;
    result?: { id: string; type: string; content: string; proxied?: boolean };
    errors?: Array<{ message: string }>;
  };

  if (!createResponse.ok || !createBody.success) {
    const reason = createBody.errors?.map((err) => err.message).join(', ') ?? createResponse.statusText;
    throw new Error(`Failed to create DNS record for ${name}: ${reason}`);
  }

  console.log(`✅ Created DNS record for ${name}:`, createBody.result);
}

async function deployWorker(): Promise<void> {
  requireEnv('CLOUDFLARE_ACCOUNT_ID', accountId);
  requireEnv('CLOUDFLARE_API_TOKEN', apiToken);
  console.log('➡️ Refreshing dataset bundles…');
  await $`bun run datasets:build`;
  console.log('➡️ Building frontend assets…');
  await $`bun run web:build`;
  await ensureDnsRecord();
  console.log('➡️ Deploying Worker via wrangler…');
  await $`WRANGLER_LOG_LEVEL=debug bunx wrangler deploy`;
}

deployWorker().catch((error) => {
  console.error('❌ Deployment failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
