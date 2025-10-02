import { CLIMATE_ESG_SOURCES, type ClimateEsgSourceEntry } from './climate_esg';
import { upsertDatasetServices, recordDatasetSnapshot, type DatasetIngestSummary } from './utils';
import { stableStringify } from '../util/json';

export const CLIMATE_ESG_DATASET_ID = 'climate_esg_sources';
export const CLIMATE_ESG_DATASET_VERSION = '2025-10-02';

function buildServiceName(entry: ClimateEsgSourceEntry): string {
  return `${entry.category}:${entry.dataset_service_name}`.toLowerCase().replace(/\s+/g, '_');
}

function buildAutomationMetadata(entry: ClimateEsgSourceEntry): string {
  return stableStringify({ dataset: CLIMATE_ESG_DATASET_ID, datasetService: entry.dataset_service_name, version: CLIMATE_ESG_DATASET_VERSION });
}

export async function ingestClimateEsgSources(env: { DB: D1Database }): Promise<DatasetIngestSummary> {
  const services = CLIMATE_ESG_SOURCES.map((entry) => ({
    serviceName: buildServiceName(entry),
    endpoint: entry.endpoint_or_download_url,
    httpMethods: ['GET'],
    parameters: entry.parameters_or_payload_schema ? { description: entry.parameters_or_payload_schema } : null,
    authentication: entry.authentication || null,
    rateLimit: entry.rate_limits || null,
    cadence: entry.update_cadence || null,
    changeDetection: entry.change_detection || null,
    statusPage: entry.status_or_support || null,
    readiness: entry.automation_readiness || null,
    notes: entry.scraping_or_manual_notes || null,
    sourceUrl: entry.endpoint_or_download_url,
    verificationDate: CLIMATE_ESG_DATASET_VERSION,
    automationMetadata: buildAutomationMetadata(entry)
  }));

  await upsertDatasetServices(env, CLIMATE_ESG_DATASET_ID, CLIMATE_ESG_DATASET_VERSION, services);
  await recordDatasetSnapshot(env, CLIMATE_ESG_DATASET_ID, CLIMATE_ESG_DATASET_VERSION, CLIMATE_ESG_SOURCES);

  return {
    datasetId: CLIMATE_ESG_DATASET_ID,
    version: CLIMATE_ESG_DATASET_VERSION,
    tables: [
      {
        table: 'dataset_services',
        inserted: services.length,
        updated: 0,
        skipped: 0,
        errors: []
      }
    ]
  };
}
