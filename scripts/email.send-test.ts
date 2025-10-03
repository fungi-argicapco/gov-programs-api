#!/usr/bin/env bun
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

import { createMailService } from '../apps/api/src/email/provider';
import type { Env } from '../apps/api/src/db';

const args = process.argv.slice(2);

let to = process.env.EMAIL_TEST_TO ?? '';
let from = process.env.EMAIL_SENDER ?? '';
let subject = '';
let htmlBody = '';
let textBody = '';
let bodyFile: string | null = null;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--to' && args[i + 1]) {
    to = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--to=')) {
    to = arg.split('=')[1] ?? to;
    continue;
  }
  if (arg === '--from' && args[i + 1]) {
    from = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--from=')) {
    from = arg.split('=')[1] ?? from;
    continue;
  }
  if (arg === '--subject' && args[i + 1]) {
    subject = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--subject=')) {
    subject = arg.split('=')[1] ?? subject;
    continue;
  }
  if (arg === '--text' && args[i + 1]) {
    textBody = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--text=')) {
    textBody = arg.split('=')[1] ?? textBody;
    continue;
  }
  if (arg === '--html' && args[i + 1]) {
    htmlBody = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--html=')) {
    htmlBody = arg.split('=')[1] ?? htmlBody;
    continue;
  }
  if (arg === '--body-file' && args[i + 1]) {
    bodyFile = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--body-file=')) {
    bodyFile = arg.split('=')[1] ?? null;
    continue;
  }
}

if (bodyFile) {
  const resolved = resolve(process.cwd(), bodyFile);
  if (!existsSync(resolved)) {
    console.error(`❌ Body file not found: ${resolved}`);
    process.exit(1);
  }
  const contents = readFileSync(resolved, 'utf8');
  htmlBody = contents;
  textBody = contents;
}

if (!to) {
  console.error('❌ Missing recipient. Provide --to or set EMAIL_TEST_TO.');
  process.exit(1);
}

if (!from) {
  console.error('❌ Missing sender. Provide --from or set EMAIL_SENDER.');
  process.exit(1);
}

if (!subject) {
  subject = `Gov Programs API test email @ ${new Date().toISOString()}`;
}

if (!htmlBody) {
  htmlBody = `<p>This is a test email sent at ${new Date().toISOString()}.</p>`;
}

if (!textBody) {
  textBody = `This is a test email sent at ${new Date().toISOString()}.`;
}

const provider = (process.env.EMAIL_PROVIDER ?? 'console').toLowerCase();
const token = process.env.POSTMARK_TOKEN;

if (provider === 'postmark' && !token) {
  console.error('❌ EMAIL_PROVIDER=postmark but POSTMARK_TOKEN is not set.');
  process.exit(1);
}

const env = {
  DB: {},
  EMAIL_PROVIDER: provider,
  POSTMARK_TOKEN: token,
  POSTMARK_API_BASE: process.env.POSTMARK_API_BASE,
} as unknown as Env;

async function main() {
  const service = createMailService(env);
  console.log(`➡️ Sending test email via ${provider} provider…`);
  await service.send({
    from,
    to,
    subject,
    html: htmlBody,
    text: textBody,
  });
  console.log('✅ Test email dispatched. Check the recipient inbox.');
}

main().catch((error) => {
  console.error('❌ Failed to send test email:', error);
  process.exitCode = 1;
});
