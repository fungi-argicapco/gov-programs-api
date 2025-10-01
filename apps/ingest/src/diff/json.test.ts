import { describe, expect, it } from 'vitest';

import { diffJson, summarizeDiff } from './json';

describe('diffJson', () => {
  it('flags critical status change', () => {
    const before = { status: 'open', start_date: '2024-01-01' };
    const after = { status: 'closed', start_date: '2024-01-01' };
    const changes = diffJson(before, after, {
      critical: ['status'],
      ignore: []
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: 'status', critical: true, kind: 'changed' });
  });

  it('ignores summary fields when configured', () => {
    const before = { summary: 'old', status: 'open' };
    const after = { summary: 'new', status: 'open' };
    const changes = diffJson(before, after, {
      critical: ['status'],
      ignore: ['summary']
    });
    expect(changes).toEqual([]);
  });

  it('captures array changes as critical when matched', () => {
    const before = { benefits: [{ max_amount_cents: 1000 }] };
    const after = { benefits: [{ max_amount_cents: 2000 }] };
    const changes = diffJson(before, after, {
      critical: ['benefits']
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: 'benefits', critical: true, kind: 'changed' });
  });
});

describe('summarizeDiff', () => {
  it('summarizes changed and critical paths', () => {
    const changes = [
      { path: 'status', kind: 'changed' as const, before: 'open', after: 'closed', critical: true },
      { path: 'summary', kind: 'changed' as const, before: 'a', after: 'b', critical: false }
    ];
    const summary = summarizeDiff(changes);
    expect(summary.totalChanges).toBe(2);
    expect(summary.criticalChanges).toBe(1);
    expect(summary.changedPaths).toContain('status');
    expect(summary.criticalPaths).toEqual(['status']);
  });
});
