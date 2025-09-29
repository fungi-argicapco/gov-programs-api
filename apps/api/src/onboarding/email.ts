import type { Env } from '../db';

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(env: Env, payload: EmailPayload): Promise<void> {
  const sender = env.EMAIL_SENDER;
  if (!sender) {
    console.warn('EMAIL_SENDER not configured; skipping email send', { to: payload.to, subject: payload.subject });
    return;
  }

  // TODO: integrate with Cloudflare Email Routing once register@fungiagricap.com is verified.
  console.log('Email send requested', {
    from: sender,
    to: payload.to,
    subject: payload.subject
  });
}

export function buildDecisionEmail(options: {
  recipient: string;
  token: string;
  decisionBaseUrl: string;
}) {
  const approveUrl = new URL(options.decisionBaseUrl);
  approveUrl.searchParams.set('token', options.token);
  approveUrl.searchParams.set('decision', 'approve');

  const declineUrl = new URL(options.decisionBaseUrl);
  declineUrl.searchParams.set('token', options.token);
  declineUrl.searchParams.set('decision', 'decline');

  const html = `
    <p>A new canvas access request is pending approval.</p>
    <p>
      <a href="${approveUrl.toString()}">Approve</a>
      &nbsp;|&nbsp;
      <a href="${declineUrl.toString()}">Decline</a>
    </p>
  `;

  return {
    to: options.recipient,
    subject: 'New fungiagricap canvas access request',
    html
  } satisfies EmailPayload;
}

export function buildDecisionResultEmail(options: {
  recipient: string;
  decision: 'approved' | 'declined';
}) {
  const { recipient, decision } = options;
  const subject = decision === 'approved'
    ? 'Your fungiagricap canvas access is approved'
    : 'Your fungiagricap canvas access request'
  ;

  const html =
    decision === 'approved'
      ? '<p>Your access has been approved. You will receive onboarding details shortly.</p>'
      : '<p>We appreciate your interest. Unfortunately we cannot grant access at this time.</p>';

  return { to: recipient, subject, html } satisfies EmailPayload;
}
