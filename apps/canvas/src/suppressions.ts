import { type CanvasEnv } from './env';

export type PostmarkWebhookPayload = {
  RecordType: string;
  Email?: string;
  Recipient?: string;
  Target?: string;
  MessageStream?: string;
  MessageID?: string;
  DeliveredAt?: string;
  BouncedAt?: string;
  ReceivedAt?: string;
  ReceivedAtUtc?: string;
  ReceivedAtUTC?: string;
  Timestamp?: string;
  Type?: string;
  TypeCode?: number;
  Description?: string;
  Details?: string;
  Metadata?: unknown;
  [key: string]: unknown;
};

export type NormalizedSuppressionEvent = {
  email: string;
  recordType: string;
  suppressed: boolean;
  reason?: string | null;
  description?: string | null;
  details?: string | null;
  occurredAt?: string | null;
  messageStream?: string | null;
  recordId?: string | null;
};

export function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

export function deriveSuppressionState(payload: PostmarkWebhookPayload): NormalizedSuppressionEvent | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const recordType = typeof payload.RecordType === 'string' ? payload.RecordType : '';
  if (!recordType) {
    return null;
  }
  const email =
    normalizeEmail(payload.Email) ??
    normalizeEmail(payload.Recipient) ??
    normalizeEmail(payload.Target);
  if (!email) {
    return null;
  }
  const reasonCandidate = typeof payload.Type === 'string' ? payload.Type.trim() : '';
  const typeCode = typeof payload.TypeCode === 'number' ? payload.TypeCode : null;
  const descriptionCandidate = typeof payload.Description === 'string' ? payload.Description.trim() : '';
  const detailsCandidate = typeof payload.Details === 'string' ? payload.Details.trim() : '';
  const suppressed = recordType === 'Bounce' || recordType === 'SpamComplaint';
  const occurredAt =
    (typeof payload.BouncedAt === 'string' && payload.BouncedAt) ||
    (typeof payload.DeliveredAt === 'string' && payload.DeliveredAt) ||
    (typeof payload.ReceivedAt === 'string' && payload.ReceivedAt) ||
    (typeof payload.ReceivedAtUTC === 'string' && payload.ReceivedAtUTC) ||
    (typeof payload.ReceivedAtUtc === 'string' && payload.ReceivedAtUtc) ||
    (typeof payload.Timestamp === 'string' && payload.Timestamp) ||
    null;
  const messageStream = typeof payload.MessageStream === 'string' ? payload.MessageStream.trim() : '';
  const recordIdCandidate =
    ((payload as { BounceID?: number }).BounceID ??
      (payload as { DeliveryID?: number }).DeliveryID ??
      (payload as { RecordID?: string }).RecordID ??
      (payload as { RecordId?: string }).RecordId ??
      payload.MessageID ??
      (payload as { ID?: string | number }).ID);
  return {
    email,
    recordType,
    suppressed,
    reason:
      reasonCandidate.length
        ? reasonCandidate
        : recordType === 'SpamComplaint'
        ? 'SpamComplaint'
        : typeCode !== null
        ? `TypeCode:${typeCode}`
        : null,
    description: descriptionCandidate.length ? descriptionCandidate : null,
    details:
      detailsCandidate.length
        ? detailsCandidate
        : typeCode !== null
        ? `TypeCode ${typeCode}`
        : null,
    occurredAt,
    messageStream: messageStream.length ? messageStream : null,
    recordId: recordIdCandidate != null ? String(recordIdCandidate) : null
  };
}

function now(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function recordSuppressionEvent(env: CanvasEnv, payload: PostmarkWebhookPayload): Promise<void> {
  const normalized = deriveSuppressionState(payload);
  if (!normalized) {
    return;
  }
  if (!env.DB) {
    console.warn('Skipping suppression persistence because DB binding is missing.');
    return;
  }
  const recordedAt = now();
  const occurredAt = normalized.occurredAt ?? recordedAt;
  const metadataJson = JSON.stringify(payload);

  await env.DB.prepare(
    `INSERT INTO email_suppression_events
      (id, email, event_type, payload, recorded_at, occurred_at, message_stream, record_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  )
    .bind(
      randomId('suppevt'),
      normalized.email,
      normalized.recordType,
      metadataJson,
      recordedAt,
      occurredAt,
      normalized.messageStream ?? null,
      normalized.recordId ?? null
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO email_suppressions
      (email, suppressed, last_event_type, last_event_at, reason, description, details, message_stream, record_id, metadata, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
     ON CONFLICT(email) DO UPDATE SET
       suppressed = excluded.suppressed,
       last_event_type = excluded.last_event_type,
       last_event_at = excluded.last_event_at,
       reason = excluded.reason,
       description = excluded.description,
       details = excluded.details,
       message_stream = excluded.message_stream,
       record_id = excluded.record_id,
       metadata = excluded.metadata,
       updated_at = excluded.updated_at`
  )
    .bind(
      normalized.email,
      normalized.suppressed ? 1 : 0,
      normalized.recordType,
      occurredAt,
      normalized.reason ?? null,
      normalized.description ?? null,
      normalized.details ?? null,
      normalized.messageStream ?? null,
      normalized.recordId ?? null,
      metadataJson,
      recordedAt,
      recordedAt
    )
    .run();
}

export async function isEmailSuppressed(db: D1Database, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }
  const record = await db
    .prepare(`SELECT suppressed FROM email_suppressions WHERE email = ?1 LIMIT 1`)
    .bind(normalized)
    .first<{ suppressed: number }>();
  return record?.suppressed === 1;
}
