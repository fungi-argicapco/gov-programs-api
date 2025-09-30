import { resolveEmailEnv, type CanvasEnv } from './env';
import { sendEmail } from './email';
import { handlePostmarkWebhook } from './postmark_webhook';

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json'
    },
    ...init
  });
}

async function handleAccountApproval(request: Request, env: CanvasEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const emailEnv = resolveEmailEnv(env);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'invalid request body' }, { status: 400 });
  }
  const to = typeof (body as { to?: string }).to === 'string' ? (body as { to?: string }).to : null;
  const subject = typeof (body as { subject?: string }).subject === 'string' ? (body as { subject?: string }).subject : null;
  const text = typeof (body as { text?: string }).text === 'string' ? (body as { text?: string }).text : null;
  const html = typeof (body as { html?: string }).html === 'string' ? (body as { html?: string }).html : null;
  const messageStream = typeof (body as { messageStream?: string }).messageStream === 'string'
    ? (body as { messageStream?: string }).messageStream
    : undefined;

  if (!to) {
    return jsonResponse({ error: 'missing recipient address' }, { status: 400 });
  }

  const effectiveSubject = subject ?? 'Your account is approved';
  const effectiveText = text ?? 'Welcome aboard! Your canvas is ready.';
  const effectiveHtml = html ?? '<p>Welcome aboard! Your canvas is ready.</p>';

  const result = await sendEmail(emailEnv, {
    to,
    subject: effectiveSubject,
    text: effectiveText,
    html: effectiveHtml,
    messageStream
  });

  return jsonResponse({ ok: true, result });
}

const worker = {
  async fetch(request: Request, env: CanvasEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/api/account/approve':
        return handleAccountApproval(request, env);
      case '/api/postmark/webhook':
        return handlePostmarkWebhook(request, env);
      default:
        return new Response('ready');
    }
  }
};

export default worker;
