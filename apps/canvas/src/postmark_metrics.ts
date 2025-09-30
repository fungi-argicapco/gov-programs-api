import type { NormalizedSuppressionEvent } from './suppressions';
import type { PostmarkWebhookPayload } from './suppressions';
import type { SuppressionSkipReason } from './suppressions';

export type PostmarkFailureSample = {
  recordType: string | null;
  messageStream: string | null;
  reason: string;
};

export type PostmarkMetricsSnapshot = {
  received: number;
  persisted: number;
  skipped: number;
  failures: number;
  suppressed: number;
  unsuppressed: number;
  countsByRecordType: Record<string, number>;
  countsByMessageStream: Record<string, number>;
  skippedByReason: Record<SuppressionSkipReason, number>;
  failureSamples: readonly PostmarkFailureSample[];
};

const MAX_FAILURE_SAMPLES = 5;

function coerceReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'unknown error';
  }
}

function coerceRecordType(payload: PostmarkWebhookPayload | NormalizedSuppressionEvent | null): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const candidate = (payload as PostmarkWebhookPayload).RecordType ??
    (payload as NormalizedSuppressionEvent).recordType;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function coerceMessageStream(payload: PostmarkWebhookPayload | NormalizedSuppressionEvent | null): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const candidate = (payload as PostmarkWebhookPayload).MessageStream ??
    (payload as NormalizedSuppressionEvent).messageStream ??
    null;
  if (typeof candidate !== 'string') {
    return null;
  }
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class PostmarkMetricsCollector {
  private received = 0;
  private persisted = 0;
  private skipped = 0;
  private failures = 0;
  private suppressed = 0;
  private unsuppressed = 0;
  private readonly countsByRecordType = new Map<string, number>();
  private readonly countsByMessageStream = new Map<string, number>();
  private readonly skippedByReason = new Map<SuppressionSkipReason, number>();
  private readonly failureSamples: PostmarkFailureSample[] = [];

  noteReceived(): void {
    this.received += 1;
  }

  notePersisted(event: NormalizedSuppressionEvent): void {
    this.persisted += 1;
    if (event.suppressed) {
      this.suppressed += 1;
    } else {
      this.unsuppressed += 1;
    }
    const recordType = event.recordType;
    if (recordType) {
      this.countsByRecordType.set(recordType, (this.countsByRecordType.get(recordType) ?? 0) + 1);
    }
    const messageStream = event.messageStream;
    if (messageStream) {
      this.countsByMessageStream.set(
        messageStream,
        (this.countsByMessageStream.get(messageStream) ?? 0) + 1
      );
    }
  }

  noteSkipped(reason: SuppressionSkipReason): void {
    this.skipped += 1;
    this.skippedByReason.set(reason, (this.skippedByReason.get(reason) ?? 0) + 1);
  }

  noteFailure(payload: PostmarkWebhookPayload, error: unknown): void {
    this.failures += 1;
    if (this.failureSamples.length >= MAX_FAILURE_SAMPLES) {
      return;
    }
    this.failureSamples.push({
      recordType: coerceRecordType(payload),
      messageStream: coerceMessageStream(payload),
      reason: coerceReason(error)
    });
  }

  hasFailures(): boolean {
    return this.failures > 0;
  }

  snapshot(): PostmarkMetricsSnapshot {
    const countsByRecordType: Record<string, number> = {};
    for (const [key, value] of this.countsByRecordType.entries()) {
      countsByRecordType[key] = value;
    }
    const countsByMessageStream: Record<string, number> = {};
    for (const [key, value] of this.countsByMessageStream.entries()) {
      countsByMessageStream[key] = value;
    }
    const skippedByReason = Object.fromEntries(this.skippedByReason.entries()) as Record<SuppressionSkipReason, number>;
    return {
      received: this.received,
      persisted: this.persisted,
      skipped: this.skipped,
      failures: this.failures,
      suppressed: this.suppressed,
      unsuppressed: this.unsuppressed,
      countsByRecordType,
      countsByMessageStream,
      skippedByReason,
      failureSamples: this.failureSamples.slice()
    };
  }
}
