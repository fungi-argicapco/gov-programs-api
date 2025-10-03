#!/usr/bin/env bun
import { argv } from 'node:process';

function usage(message?: string): never {
  if (message) {
    console.error(`❌ ${message}`);
  }
  console.error(`Usage: bun run scripts/postmark.webhook.ts [--url URL] [--secret SECRET] [--dry-run]

Configures the Postmark outbound webhook to forward bounce/spam notifications to the Canvas worker.
Requires POSTMARK_SERVER_TOKEN to be set (server API token). Optionally provide --secret or set POSTMARK_WEBHOOK_SECRET.
`);
  process.exit(1);
}

const args = argv.slice(2);
let targetUrl = 'https://program.fungiagricap.com/api/postmark/webhook';
let providedSecret: string | null = null;
let dryRun = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    usage();
  }
  if (arg === '--url' && args[i + 1]) {
    targetUrl = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--url=')) {
    targetUrl = arg.split('=')[1] ?? targetUrl;
    continue;
  }
  if (arg === '--secret' && args[i + 1]) {
    providedSecret = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--secret=')) {
    providedSecret = arg.split('=')[1] ?? providedSecret;
    continue;
  }
  if (arg === '--dry-run') {
    dryRun = true;
    continue;
  }
}

const serverToken = process.env.POSTMARK_SERVER_TOKEN;
if (!serverToken) {
  usage('POSTMARK_SERVER_TOKEN is not set.');
}

const webhookSecret = providedSecret ?? process.env.POSTMARK_WEBHOOK_SECRET;
if (!webhookSecret) {
  usage('No webhook secret provided. Pass --secret or export POSTMARK_WEBHOOK_SECRET.');
}

const payload = {
  Url: targetUrl,
  Enabled: true,
  AuthToken: webhookSecret,
  HttpAuth: null,
  HttpHeaders: [],
  Triggers: {
    Open: { Enabled: false, PostFirstOpenOnly: false },
    Click: { Enabled: false },
    Delivery: { Enabled: false },
    Bounce: { Enabled: true, IncludeContent: false },
    SpamComplaint: { Enabled: true },
    SubscriptionChange: { Enabled: false },
    Inbound: { Enabled: false },
    Outbound: { Enabled: false },
    OutboundSpam: { Enabled: false, IncludeContent: false }
  }
};

if (dryRun) {
  console.log('ℹ️ Dry run: would configure Postmark outbound webhook with payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\nSet POSTMARK_SERVER_TOKEN and rerun without --dry-run to apply.');
  process.exit(0);
}

async function configureWebhook() {
  const endpoint = 'https://api.postmarkapp.com/server/webhooks/outbound';
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Postmark-Server-Token': serverToken as string
  } satisfies HeadersInit;

  const attempt = async (method: 'PUT' | 'POST') => {
    return fetch(endpoint, {
      method,
      headers,
      body: JSON.stringify(payload)
    });
  };

  let response = await attempt('PUT');
  if (response.status === 404) {
    response = await attempt('POST');
  }

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('❌ Failed to configure Postmark webhook:', response.status, response.statusText, errorBody);
    process.exit(1);
  }

  const resultText = await response.text();
  console.log('✅ Postmark webhook configured. Response:');
  console.log(resultText || '(empty response)');
  console.log('\nRemember to store the webhook secret in Cloudflare:');
  console.log('  echo "$POSTMARK_WEBHOOK_SECRET" | bunx wrangler secret put POSTMARK_WEBHOOK_SECRET');
}

configureWebhook().catch((error) => {
  console.error('❌ postmark:webhook failed', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
