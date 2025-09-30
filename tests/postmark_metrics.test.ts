import { describe, expect, it } from 'vitest';
import { PostmarkMetricsCollector } from '../apps/canvas/src/postmark_metrics';
import type { NormalizedSuppressionEvent } from '../apps/canvas/src/suppressions';

const sampleEvent = (overrides: Partial<NormalizedSuppressionEvent> = {}): NormalizedSuppressionEvent => ({
  email: 'sample@example.com',
  recordType: overrides.recordType ?? 'Bounce',
  suppressed: overrides.suppressed ?? true,
  reason: overrides.reason ?? null,
  description: overrides.description ?? null,
  details: overrides.details ?? null,
  occurredAt: overrides.occurredAt ?? '2024-01-01T00:00:00Z',
  messageStream: overrides.messageStream ?? 'outbound',
  recordId: overrides.recordId ?? 'evt'
});

describe('PostmarkMetricsCollector', () => {
  it('captures persisted, skipped and failure counts', () => {
    const collector = new PostmarkMetricsCollector();
    collector.noteReceived();
    collector.notePersisted(sampleEvent({ recordType: 'Bounce', suppressed: true, messageStream: 'outbound' }));
    collector.noteReceived();
    collector.noteSkipped('invalid-payload');
    collector.noteReceived();
    collector.noteFailure({ RecordType: 'SpamComplaint', MessageStream: 'outbound' }, new Error('boom'));

    const snapshot = collector.snapshot();
    expect(snapshot.received).toBe(3);
    expect(snapshot.persisted).toBe(1);
    expect(snapshot.skipped).toBe(1);
    expect(snapshot.failures).toBe(1);
    expect(snapshot.suppressed).toBe(1);
    expect(snapshot.unsuppressed).toBe(0);
    expect(snapshot.countsByRecordType).toEqual({ Bounce: 1 });
    expect(snapshot.countsByMessageStream).toEqual({ outbound: 1 });
    expect(snapshot.skippedByReason).toEqual({ 'invalid-payload': 1 });
    expect(snapshot.failureSamples).toHaveLength(1);
    expect(snapshot.failureSamples[0]).toEqual({
      recordType: 'SpamComplaint',
      messageStream: 'outbound',
      reason: 'boom'
    });
  });

  it('limits failure samples', () => {
    const collector = new PostmarkMetricsCollector();
    for (let i = 0; i < 10; i++) {
      collector.noteReceived();
      collector.noteFailure({ RecordType: 'Bounce' }, new Error(`err-${i}`));
    }
    expect(collector.snapshot().failureSamples).toHaveLength(5);
  });
});
