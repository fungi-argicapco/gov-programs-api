import { getWebhookSecret, getWebhookBasicAuth, type CanvasEnv } from './env';
import { PostmarkMetricsCollector } from './postmark_metrics';
import {
  recordSuppressionEvent,
  type PostmarkWebhookPayload,
  type SuppressionPersistenceResult
} from './suppressions';

async function verifySignature(payload: string, signature: string, secret: string) {
  const normalizedSignature = signature.trim();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signatureBytes = Uint8Array.from(atob(normalizedSignature), (char) => char.charCodeAt(0));
  const ok = await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(payload));
  if (!ok) {
    throw new Error('invalid signature');
  }
}

function parsePayload(body: string): PostmarkWebhookPayload[] {
  const data = JSON.parse(body) as unknown;
  if (Array.isArray(data)) {
    return data.filter((entry): entry is PostmarkWebhookPayload => entry !== null && typeof entry === 'object');
  }
  if (data && typeof data === 'object') {
    return [data as PostmarkWebhookPayload];
  }
  throw new Error('invalid payload');
}

export async function handlePostmarkWebhook(req: Request, env: CanvasEnv): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const bodyText = await req.text();
  const secret = getWebhookSecret(env);
  const basicAuth = getWebhookBasicAuth(env);

  if (secret) {
    const signature = req.headers.get('X-Postmark-Signature');
    if (!signature) {
      return new Response('forbidden', { status: 403 });
    }
    try {
      await verifySignature(bodyText, signature, secret);
    } catch (error) {
      console.error('Postmark webhook signature validation failed:', error);
      return new Response('forbidden', { status: 403 });
    }
  } else if (basicAuth) {
    const header = req.headers.get('Authorization');
    if (!header || !header.startsWith('Basic ')) {
      return new Response('forbidden', { status: 403 });
    }
    const decoded = atob(header.slice('Basic '.length));
    const [user, pass] = decoded.split(':');
    if (user !== basicAuth.user || pass !== basicAuth.pass) {
      return new Response('forbidden', { status: 403 });
    }
  }

  let events: PostmarkWebhookPayload[];
  try {
    events = parsePayload(bodyText);
  } catch (error) {
    console.error('Postmark webhook parse error:', error);
    return new Response('bad request', { status: 400 });
  }

  const metrics = new PostmarkMetricsCollector();

  for (const event of events) {
    metrics.noteReceived();
    try {
      const result: SuppressionPersistenceResult = await recordSuppressionEvent(env, event);
      if (result.status === 'persisted') {
        metrics.notePersisted(result.event);
      } else {
        metrics.noteSkipped(result.reason);
      }
    } catch (error) {
      metrics.noteFailure(event, error);
    }
  }

  const snapshot = metrics.snapshot();

  if (metrics.hasFailures()) {
    console.error('Postmark webhook persistence failed:', snapshot);
    return new Response('server error', { status: 500 });
  }

  if (snapshot.received > 0) {
    console.log('Postmark webhook processed:', snapshot);
  }

  return new Response('ok');
}
