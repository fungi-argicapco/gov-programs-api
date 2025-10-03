import { SAM_ASSISTANCE_SYNTHETIC_RESPONSE } from '../synthetic/us_sam_assistance_sample';

type RequestValue = string | number | boolean | { env: string };

export type SourceRequest = {
  method?: 'GET' | 'POST';
  headers?: Record<string, RequestValue>;
  body?: unknown;
  query?: Record<string, RequestValue>;
};

export type SourceDef = {
  id: string;
  authority: 'federal' | 'state' | 'prov' | 'territory';
  country: 'US' | 'CA';
  jurisdiction: string;
  kind: 'json' | 'rss' | 'html';
  entrypoint: string;
  parser: 'json_api_generic' | 'rss_generic' | 'html_table_generic';
  path?: string;
  mapFn?: string;
  rate: { rps: number; burst: number };
  schedule: '4h' | 'daily';
  license?: string;
  tosUrl?: string;
  request?: SourceRequest;
  synthetic?: { data: unknown; reason: string };
};

export const SOURCES: SourceDef[] = [
  {
    id: 'us-fed-grants-gov',
    authority: 'federal',
    country: 'US',
    jurisdiction: 'US-FED',
    kind: 'json',
    entrypoint: 'https://apply07.grants.gov/grantsws/rest/opportunities/search',
    parser: 'json_api_generic',
    path: 'oppHits',
    mapFn: 'mapGrantsGov',
    rate: { rps: 2, burst: 5 },
    schedule: '4h',
    license: 'https://www.grants.gov/help/html/help/Register/SAM.gov-Data-Usage-Agreement.htm',
    tosUrl: 'https://www.grants.gov/web/grants/policy/policy-guidance/sam-gov-data-usage-agreement.html',
    request: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        searchParams: {
          resultType: 'json',
          searchOnly: false,
          oppNum: '',
          cfda: '',
          sortBy: 'closeDate',
          oppStatuses: 'forecasted|posted',
          startRecordNum: 0,
          eligibilities: '',
          fundingInstruments: '',
          fundingCategories: '',
          agencies: '',
          rows: 200,
          keyword: '',
          keywordEncoded: false
        }
      }
    }
  },
  {
    id: 'us-fed-sam-assistance',
    authority: 'federal',
    country: 'US',
    jurisdiction: 'US-FED',
    kind: 'json',
    entrypoint: 'https://api.sam.gov/prod/opportunities/v2/search',
    parser: 'json_api_generic',
    path: 'opportunitiesData',
    mapFn: 'mapSamAssistance',
    rate: { rps: 1, burst: 3 },
    schedule: 'daily',
    license: 'https://open.gsa.gov/api/sam/#terms',
    tosUrl: 'https://sam.gov/content/privacy-policy',
    request: {
      method: 'GET',
      query: {
        index: 'assistancelisting',
        postedFrom: '__DAYS_AGO_30__',
        postedTo: '__TODAY__',
        limit: 200,
        offset: 0,
        api_key: { env: 'SAM_API_KEY' }
      }
    },
    synthetic: {
      reason: 'SAM_API_KEY not provisioned',
      data: SAM_ASSISTANCE_SYNTHETIC_RESPONSE
    }
  },
  {
    id: 'ca-fed-open-gov',
    authority: 'federal',
    country: 'CA',
    jurisdiction: 'CA-FED',
    kind: 'json',
    entrypoint:
      'https://open.canada.ca/data/en/api/3/action/package_search?q=assistance%20program&rows=100',
    parser: 'json_api_generic',
    path: 'result.results',
    mapFn: 'mapCkanGC',
    rate: { rps: 1, burst: 2 },
    schedule: 'daily',
    license: 'https://open.canada.ca/en/open-government-licence-canada'
  },
  {
    id: 'ca-on-grants',
    authority: 'prov',
    country: 'CA',
    jurisdiction: 'CA-ON',
    kind: 'json',
    entrypoint:
      'https://data.ontario.ca/en/api/3/action/package_search?q=grant&rows=100',
    parser: 'json_api_generic',
    path: 'result.results',
    mapFn: 'mapCkanProvON',
    rate: { rps: 1, burst: 2 },
    schedule: 'daily',
    license: 'https://www.ontario.ca/page/open-government-licence-ontario'
  }
];
