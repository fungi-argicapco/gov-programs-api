import { stableStringify } from '../util/json';

type Env = { DB: D1Database };

export function buildDatasetAutomation(datasetId: string, version: string, artifact: string): string {
  return stableStringify({ datasetId, version, artifact });
}

export async function recordDatasetSnapshot(
  env: Env,
  datasetId: string,
  version: string,
  payload: unknown,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const now = Date.now();
  const payloadJson = stableStringify(payload);
  const metaJson = Object.keys(metadata).length > 0 ? stableStringify(metadata) : null;
  await env.DB.prepare(
    `INSERT INTO dataset_snapshots (dataset_id, version, captured_at, payload, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(datasetId, version, now, payloadJson, metaJson, now)
    .run();
}

type DatasetServiceConfig = {
  serviceName: string;
  endpoint: string;
  httpMethods?: readonly string[];
  parameters?: Record<string, unknown> | null;
  authentication?: string | null;
  rateLimit?: string | null;
  cadence?: string | null;
  changeDetection?: string | null;
  statusPage?: string | null;
  readiness?: string | null;
  notes?: string | null;
  sourceUrl?: string | null;
  verificationDate?: string | null;
};

export async function upsertDatasetServices(
  env: Env,
  datasetId: string,
  version: string,
  services: readonly DatasetServiceConfig[]
): Promise<void> {
  const now = Date.now();
  for (const service of services) {
    const automation = buildDatasetAutomation(datasetId, version, `${service.serviceName}-service`);
    const metadataJson = stableStringify(service);
    const methods = service.httpMethods?.join('|') ?? null;
    const paramsJson = service.parameters ? stableStringify(service.parameters) : null;

    await env.DB.prepare(
      `INSERT INTO dataset_services (
         dataset_id,
         service_name,
         endpoint,
         http_methods,
         parameters,
         authentication,
         rate_limit,
         cadence,
         change_detection,
         status_page,
         readiness,
         notes,
         source_url,
         verification_date,
         automation_metadata,
         metadata,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(dataset_id, service_name) DO UPDATE SET
         endpoint = excluded.endpoint,
         http_methods = excluded.http_methods,
         parameters = excluded.parameters,
         authentication = excluded.authentication,
         rate_limit = excluded.rate_limit,
         cadence = excluded.cadence,
         change_detection = excluded.change_detection,
         status_page = excluded.status_page,
         readiness = excluded.readiness,
         notes = excluded.notes,
         source_url = excluded.source_url,
         verification_date = excluded.verification_date,
         automation_metadata = excluded.automation_metadata,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at
      `
    )
      .bind(
        datasetId,
        service.serviceName,
        service.endpoint,
        methods,
        paramsJson,
        service.authentication ?? null,
        service.rateLimit ?? null,
        service.cadence ?? null,
        service.changeDetection ?? null,
        service.statusPage ?? null,
        service.readiness ?? null,
        service.notes ?? null,
        service.sourceUrl ?? null,
        service.verificationDate ?? null,
        automation,
        metadataJson,
        now,
        now
      )
      .run();
  }
}

export type DatasetIngestSummary = {
  datasetId: string;
  version: string;
  tables: readonly {
    table: string;
    inserted: number;
    updated: number;
    skipped: number;
    errors: readonly string[];
  }[];
};
