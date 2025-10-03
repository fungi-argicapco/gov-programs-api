#!/usr/bin/env bun
import { URL } from 'node:url';

function usage(): never {
  console.error(`Usage: bun run scripts/verify-sam-endpoint.ts [--key SAM_API_KEY] [--summary]

Checks the SAM.gov public APIs to confirm credentials and endpoint health.
If --key is omitted, the script reads SAM_API_KEY from the environment.`);
  process.exit(1);
}

const args = process.argv.slice(2);
let suppliedKey: string | null = null;
let summaryOnly = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    usage();
  }
  if (arg === '--key' && args[i + 1]) {
    suppliedKey = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--key=')) {
    suppliedKey = arg.split('=')[1] ?? null;
    continue;
  }
  if (arg === '--summary') {
    summaryOnly = true;
    continue;
  }
}

const apiKey = suppliedKey ?? process.env.SAM_API_KEY ?? null;
if (!apiKey) {
  console.error('❌ Missing SAM API key. Provide via --key or SAM_API_KEY env variable.');
  process.exit(1);
}

type CheckConfig = {
  name: string;
  url: string;
  query: Record<string, string | number | boolean>;
  expectedOk: boolean;
};

function formatDateMmDdYyyy(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function daysAgo(amount: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - amount);
  return date;
}

const checks: CheckConfig[] = [
  {
    name: 'legacy_sgs',
    url: 'https://api.sam.gov/prod/sgs/v1/search',
    query: {
      index: 'assistancelisting',
      q: '*',
      sort: '-modifiedDate',
      page: 0,
      size: 1,
      api_key: apiKey
    },
    expectedOk: false
  },
  {
    name: 'opportunities_v2',
    url: 'https://api.sam.gov/prod/opportunities/v2/search',
    query: {
      postedFrom: formatDateMmDdYyyy(daysAgo(30)),
      postedTo: formatDateMmDdYyyy(new Date()),
      limit: 1,
      offset: 0,
      api_key: apiKey
    },
    expectedOk: true
  }
];

type Result = {
  name: string;
  status: number;
  ok: boolean;
  durationMs: number;
  bodySummary: string;
};

async function runCheck(config: CheckConfig): Promise<Result> {
  const target = new URL(config.url);
  for (const [key, value] of Object.entries(config.query)) {
    target.searchParams.set(key, String(value));
  }
  const started = Date.now();
  const response = await fetch(target.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });
  const durationMs = Date.now() - started;
  const rawBody = await response.text();
  let bodySummary = rawBody.slice(0, 200);
  try {
    const json = JSON.parse(rawBody);
    if (json && typeof json === 'object') {
      if ('totalRecords' in json) {
        bodySummary = `totalRecords=${(json as { totalRecords?: unknown }).totalRecords}`;
      } else if ('responseStatus' in json) {
        bodySummary = JSON.stringify((json as { responseStatus: unknown }).responseStatus).slice(0, 200);
      } else if ('message' in json) {
        bodySummary = JSON.stringify((json as { message: unknown }).message).slice(0, 200);
      } else {
        bodySummary = JSON.stringify(json).slice(0, 200);
      }
    }
  } catch {
    // raw body summary already assigned
  }

  return {
    name: config.name,
    status: response.status,
    ok: response.ok,
    durationMs,
    bodySummary
  };
}

async function main() {
  const results: Result[] = [];
  for (const config of checks) {
    try {
      const result = await runCheck(config);
      results.push(result);
      const statusLine = `${result.status} ${result.ok ? 'OK' : 'ERR'}`;
      if (!summaryOnly) {
        console.log(`[${config.name}] ${statusLine} in ${result.durationMs}ms :: ${result.bodySummary}`);
      }
    } catch (error) {
      console.error(`[${config.name}] Request failed:`, error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }

  const opportunities = results.find((r) => r.name === 'opportunities_v2');
  if (!opportunities || !opportunities.ok) {
    console.error('❌ SAM opportunities endpoint check failed. Investigate endpoint or API key.');
    process.exit(1);
  }

  const legacy = results.find((r) => r.name === 'legacy_sgs');
  if (legacy?.ok) {
    console.warn('⚠️ Legacy SGS endpoint responded OK. Review ingestion configuration; it may still be valid.');
  }

  console.log('✅ SAM endpoint verification passed.');
}

main().catch((error) => {
  console.error('verify-sam-endpoint failed', error);
  process.exit(1);
});
