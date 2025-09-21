export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
}

export interface DataSource {
  name: string;
  url: string;
  type: 'api' | 'csv' | 'xml' | 'json';
  lastUpdated?: string;
  enabled: boolean;
}

export interface IngestionResult {
  source: string;
  programsProcessed: number;
  programsCreated: number;
  programsUpdated: number;
  errors: string[];
  duration: number;
}

export interface IngestionSummary {
  timestamp: string;
  totalSources: number;
  successfulSources: number;
  failedSources: number;
  totalProgramsProcessed: number;
  totalProgramsCreated: number;
  totalProgramsUpdated: number;
  results: IngestionResult[];
  errors: string[];
}