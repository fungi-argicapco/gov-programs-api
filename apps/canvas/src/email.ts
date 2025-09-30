import { isEmailSuppressed } from './suppressions';

export type SendEmailPayload = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  messageStream?: string;
};

export type EmailEnv = {
  POSTMARK_TOKEN: string;
  EMAIL_SENDER: string;
  DB?: D1Database;
  POSTMARK_MESSAGE_STREAM?: string;
};

function ensureRecipient(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Recipient address is required.');
  }
  return trimmed;
}

function ensureSubject(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Email subject is required.');
  }
  return trimmed;
}

export async function sendEmail(env: EmailEnv, payload: SendEmailPayload) {
  const to = ensureRecipient(payload.to);
  const subject = ensureSubject(payload.subject);
  const messageStream = payload.messageStream ?? env.POSTMARK_MESSAGE_STREAM ?? 'outbound';

  if (env.DB) {
    const suppressed = await isEmailSuppressed(env.DB, to);
    if (suppressed) {
      throw new Error(`Recipient ${to} is currently suppressed.`);
    }
  }

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': env.POSTMARK_TOKEN
    },
    body: JSON.stringify({
      From: env.EMAIL_SENDER,
      To: to,
      Subject: subject,
      TextBody: payload.text,
      HtmlBody: payload.html,
      MessageStream: messageStream
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Postmark send failed: ${res.status} ${err}`);
  }

  return res.json();
}
