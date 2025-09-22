import { CA_PROVINCIAL_PROGRAMS_TABLE } from '../fixtures/ca_provincial_programs';
import { US_FEDERAL_GRANTS_FIXTURE } from '../fixtures/us_federal_grants';
import { US_STATE_PROGRAMS_RSS } from '../fixtures/us_state_programs_rss';

export type Phase1Source =
  | {
      kind: 'json';
      enabled: boolean;
      country: 'US' | 'CA';
      authority: 'federal' | 'prov';
      jurisdiction: string;
      url: string;
      limit?: number;
      source: { name: string; url: string; license?: string; tos_url?: string };
      data: unknown;
    }
  | {
      kind: 'html';
      enabled: boolean;
      country: 'US' | 'CA';
      authority: 'prov';
      jurisdiction: string;
      url: string;
      html: string;
      columns: { title: string; url?: string; summary?: string; status?: string };
      limit?: number;
      source: { name: string; url: string; license?: string; tos_url?: string };
    }
  | {
      kind: 'rss';
      enabled: boolean;
      country: 'US' | 'CA';
      authority: 'state';
      jurisdiction: string;
      url: string;
      feed: string;
      limit?: number;
      source: { name: string; url: string; license?: string; tos_url?: string };
    };

export const PHASE1_SOURCES: Phase1Source[] = [
  {
    kind: 'json',
    enabled: true,
    country: 'US',
    authority: 'federal',
    jurisdiction: 'US-FED',
    url: 'fixture:us_federal_grants',
    limit: 50,
    data: US_FEDERAL_GRANTS_FIXTURE,
    source: {
      name: 'US Department of Energy & Economic Development Administration (fixtures)',
      url: 'https://www.energy.gov/;https://www.eda.gov/',
      license: 'Open Government Data (example)'
    }
  },
  {
    kind: 'html',
    enabled: true,
    country: 'CA',
    authority: 'prov',
    jurisdiction: 'CA-ON',
    url: 'fixture:ca_provincial_programs',
    html: CA_PROVINCIAL_PROGRAMS_TABLE,
    columns: {
      title: 'td:nth-child(1) a',
      url: 'td:nth-child(1) a',
      summary: 'td:nth-child(2)',
      status: 'td:nth-child(3)'
    },
    limit: 50,
    source: {
      name: 'Ontario & British Columbia Incentives (fixtures)',
      url: 'https://www.ontario.ca/;https://www2.gov.bc.ca/',
      license: 'Open Government Licence - Canada'
    }
  },
  {
    kind: 'rss',
    enabled: true,
    country: 'US',
    authority: 'state',
    jurisdiction: 'US-WA',
    url: 'fixture:us_state_programs_rss',
    feed: US_STATE_PROGRAMS_RSS,
    limit: 20,
    source: {
      name: 'Washington State Department of Commerce (fixture)',
      url: 'https://www.commerce.wa.gov/',
      license: 'WA Open Data Commons'
    }
  }
];
