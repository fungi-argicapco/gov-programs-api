import type { UpsertOutcome, ProgramDiffRecord } from './upsert';

export type RunStatus = 'ok' | 'error' | 'partial';

export type ProgramDiffSample = {
  uid: string;
  diff: ProgramDiffRecord;
};

export type RunDiffSummary = {
  totalProgramsChanged: number;
  totalChanges: number;
  criticalPrograms: number;
  criticalChanges: number;
  samples: ProgramDiffSample[];
};

export type IngestionRunStartEvent = {
  sourceId: string;
  sourceRowId: number;
  runId: number | null;
  startedAt: number;
};

export type IngestionRunCompleteEvent = {
  sourceId: string;
  sourceRowId: number;
  runId: number | null;
  status: RunStatus;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  errors: number;
  notes: string[];
  diffSummary: RunDiffSummary;
};

export interface MetricsAdapter {
  onRunStart?: (event: IngestionRunStartEvent) => void | Promise<void>;
  onRunComplete?: (event: IngestionRunCompleteEvent) => void | Promise<void>;
}

const MAX_SAMPLES = 5;

export const summarizeOutcomes = (outcomes: UpsertOutcome[]): RunDiffSummary => {
  const samples: ProgramDiffSample[] = [];
  let totalProgramsChanged = 0;
  let totalChanges = 0;
  let criticalPrograms = 0;
  let criticalChanges = 0;

  for (const outcome of outcomes) {
    if (outcome.status === 'unchanged' || !outcome.diff) {
      continue;
    }
    totalProgramsChanged += 1;
    totalChanges += outcome.diff.summary.totalChanges;
    criticalChanges += outcome.diff.summary.criticalChanges;
    if (outcome.diff.summary.criticalChanges > 0) {
      criticalPrograms += 1;
    }
    if (samples.length < MAX_SAMPLES) {
      samples.push({ uid: outcome.uid, diff: outcome.diff });
    }
  }

  return {
    totalProgramsChanged,
    totalChanges,
    criticalPrograms,
    criticalChanges,
    samples
  };
};

export const createConsoleMetricsAdapter = (): MetricsAdapter => ({
  async onRunComplete(event) {
    const payload = {
      type: 'ingest_run',
      sourceId: event.sourceId,
      runId: event.runId,
      status: event.status,
      durationMs: event.durationMs,
      fetched: event.fetched,
      inserted: event.inserted,
      updated: event.updated,
      unchanged: event.unchanged,
      errors: event.errors,
      criticalChanges: event.diffSummary.criticalChanges,
      totalChanges: event.diffSummary.totalChanges,
      totalProgramsChanged: event.diffSummary.totalProgramsChanged,
      notes: event.notes
    };
    console.log(JSON.stringify(payload));
  }
});

export const noopMetricsAdapter: MetricsAdapter = {};

export const getIngestionMetricsAdapter = (env: { METRICS_DISABLE?: string } | undefined): MetricsAdapter => {
  const flag = env?.METRICS_DISABLE;
  if (flag === '1' || flag === 'true') {
    return noopMetricsAdapter;
  }
  return createConsoleMetricsAdapter();
};
