export interface FederalGrantFixture {
  title: string;
  summary: string;
  url: string;
  status: 'open' | 'scheduled' | 'closed' | 'unknown';
  benefit_type: 'grant' | 'rebate' | 'tax_credit' | 'loan' | 'guarantee' | 'voucher' | 'other';
  industry_codes: string[];
  start_date?: string;
  end_date?: string;
  benefits?: {
    type: string;
    min_amount_cents?: number | null;
    max_amount_cents?: number | null;
    currency_code?: string;
    notes?: string;
  }[];
  tags?: string[];
  criteria?: { kind: string; operator: string; value: string }[];
}

export const US_FEDERAL_GRANTS_FIXTURE: FederalGrantFixture[] = [
  {
    title: 'DOE Small Business Innovation Research (SBIR) Phase I',
    summary:
      'Supports US-based small businesses conducting early-stage research and development projects with commercialization potential.',
    url: 'https://www.energy.gov/eere/amo/small-business-innovation-research-and-small-business-technology-transfer-programs',
    status: 'open',
    benefit_type: 'grant',
    industry_codes: ['541715', '541330'],
    start_date: '2024-12-01',
    end_date: '2025-02-10',
    benefits: [
      {
        type: 'grant',
        max_amount_cents: 20000000,
        currency_code: 'USD',
        notes: 'Phase I awards up to $200,000 with potential Phase II follow-on funding.'
      }
    ],
    tags: ['federal', 'sbir'],
    criteria: [
      { kind: 'company_size', operator: '<=', value: '500' },
      { kind: 'location', operator: '=', value: 'US' }
    ]
  },
  {
    title: 'EDA Build to Scale Venture Challenge',
    summary:
      'Funds innovation-driven entrepreneurship ecosystems that support scalable technology startups and regional economic growth.',
    url: 'https://www.eda.gov/funding/programs/build-to-scale',
    status: 'scheduled',
    benefit_type: 'grant',
    industry_codes: ['541612', '541611'],
    start_date: '2025-01-15',
    end_date: '2025-03-14',
    benefits: [
      {
        type: 'grant',
        min_amount_cents: 100000000,
        max_amount_cents: 1500000000,
        currency_code: 'USD',
        notes: 'Awards typically range from $1M to $1.5M with a 1:1 cost share requirement.'
      }
    ],
    tags: ['economic-development', 'federal'],
    criteria: [
      { kind: 'organization_type', operator: 'in', value: 'nonprofit,university,government' },
      { kind: 'match_requirement', operator: '=', value: '1:1' }
    ]
  }
];
