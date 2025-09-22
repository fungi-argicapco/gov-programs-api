#!/usr/bin/env bun
import { convert } from 'ts-to-openapi';
import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const typesFile = path.resolve(repoRoot, 'apps/api/src/types.ts');
const tsconfig = path.resolve(repoRoot, 'tsconfig.openapi.json');

const targetTypes = [
  'ProgramBenefitResponse',
  'ProgramCriterionResponse',
  'ProgramResponse',
  'ProgramListResponse',
  'ProgramDetailResponse',
  'SourceResponse',
  'SourcesResponse',
  'CoverageResponse',
  'HealthResponse'
];

const schemas: Record<string, unknown> = {};
for (const typeName of targetTypes) {
  const conversion = convert({
    path: typesFile,
    tsConfigPath: tsconfig,
    types: [typeName],
    jsonFormat: true,
    asComment: false,
    skipTypeCheck: true
  });
  const parsed = JSON.parse(conversion);
  const extracted = parsed.components?.schemas ?? parsed.schemas ?? {};
  Object.assign(schemas, extracted);
}

const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Government Programs API',
    version: '1.0.0',
    description: 'Phase 1 public API for discovering government incentive programs.'
  },
  servers: [
    { url: 'https://api.example.com', description: 'Production (example placeholder)' }
  ],
  paths: {
    '/v1/health': {
      get: {
        summary: 'Service health check',
        operationId: 'getHealth',
        responses: {
          '200': {
            description: 'Successful health response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' }
              }
            }
          }
        }
      }
    },
    '/v1/programs': {
      get: {
        summary: 'List programs',
        operationId: 'listPrograms',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Full-text search query' },
          { name: 'country', in: 'query', schema: { type: 'string', enum: ['US', 'CA'] } },
          { name: 'state_province', in: 'query', schema: { type: 'string' }, description: 'State or province code (e.g., WA)' },
          { name: 'industry[]', in: 'query', schema: { type: 'string' }, style: 'form', explode: true },
          { name: 'benefit_type[]', in: 'query', schema: { type: 'string' }, style: 'form', explode: true },
          { name: 'status[]', in: 'query', schema: { type: 'string' }, style: 'form', explode: true },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['updated_at', '-updated_at', 'title', '-title'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'page_size', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } }
        ],
        responses: {
          '200': {
            description: 'Programs response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProgramListResponse' }
              }
            }
          }
        }
      }
    },
    '/v1/programs/{id}': {
      get: {
        summary: 'Get a program by ID or UID',
        operationId: 'getProgram',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Program UID or numeric identifier'
          }
        ],
        responses: {
          '200': {
            description: 'Program detail',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProgramDetailResponse' }
              }
            }
          },
          '404': {
            description: 'Program not found'
          }
        }
      }
    },
    '/v1/sources': {
      get: {
        summary: 'List ingestion sources',
        operationId: 'listSources',
        responses: {
          '200': {
            description: 'Sources response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SourcesResponse' }
              }
            }
          }
        }
      }
    },
    '/v1/stats/coverage': {
      get: {
        summary: 'Coverage statistics',
        operationId: 'getCoverageStats',
        responses: {
          '200': {
            description: 'Coverage summary grouped by jurisdiction and benefit type',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CoverageResponse' }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas
  }
};

const outputPath = path.resolve(repoRoot, 'openapi.json');
await writeFile(outputPath, JSON.stringify(openapi, null, 2) + '\n');
console.log(`openapi.json written to ${outputPath}`);
