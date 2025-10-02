import type { DatasetIngestSummary } from './utils';
import { ingestTechlandDataset, TECHLAND_DATASET_ID, TECHLAND_DATASET_VERSION } from './techland_ingest';
import { ingestCognitiveDataset, COGNITIVE_DATASET_ID, COGNITIVE_DATASET_VERSION } from './cognitiveos_ingest';
import { ingestMacroGlobalDataset, MACRO_GLOBAL_DATASET_ID, MACRO_GLOBAL_DATASET_VERSION } from './macro_global_ingest';

export type DatasetDefinition = {
  id: string;
  label: string;
  version: string;
  ingest: (env: { DB: D1Database }) => Promise<DatasetIngestSummary>;
};

export const DATASET_REGISTRY: readonly DatasetDefinition[] = [
  {
    id: TECHLAND_DATASET_ID,
    label: 'TechLand – Top US States (Industry & Infrastructure)',
    version: TECHLAND_DATASET_VERSION,
    ingest: ingestTechlandDataset
  },
  {
    id: COGNITIVE_DATASET_ID,
    label: 'CognitiveOS – Partner Stack & Capital Plan',
    version: COGNITIVE_DATASET_VERSION,
    ingest: ingestCognitiveDataset
  },
  {
    id: MACRO_GLOBAL_DATASET_ID,
    label: 'Global Macro Metrics & Socio Indicators',
    version: MACRO_GLOBAL_DATASET_VERSION,
    ingest: ingestMacroGlobalDataset
  }
];
