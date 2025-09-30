export interface ProgramBenefitResponse {
  type: string;
  min_amount_cents: number | null;
  max_amount_cents: number | null;
  currency_code: string | null;
  notes: string | null;
}

export type ApiBenefitType =
  | 'grant'
  | 'rebate'
  | 'tax_credit'
  | 'loan'
  | 'guarantee'
  | 'voucher'
  | 'other';

export type ApiProgramStatus = 'open' | 'scheduled' | 'closed' | 'unknown';

export interface ProgramCriterionResponse {
  kind: string;
  operator: string;
  value: string;
}

export interface ProgramResponse {
  id: number;
  uid: string;
  country_code: 'US' | 'CA' | 'UK';
  authority_level: 'federal' | 'state' | 'prov' | 'territory' | 'regional' | 'municipal';
  jurisdiction_code: string;
  title: string;
  summary?: string | null;
  benefit_type?: ApiBenefitType | null;
  status: ApiProgramStatus;
  industry_codes: string[];
  start_date?: string | null;
  end_date?: string | null;
  url?: string | null;
  source_id?: number | null;
  created_at: number;
  updated_at: number;
  benefits: ProgramBenefitResponse[];
  criteria: ProgramCriterionResponse[];
  tags: string[];
}

export interface ProgramListResponse {
  data: ProgramResponse[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface ProgramDetailResponse extends ProgramResponse {}

export interface SourceRateResponse {
  rps: number;
  burst: number;
}

export interface SourceResponse {
  id: number;
  source_id: number;
  country_code: string | null;
  authority: string;
  jurisdiction_code: string;
  kind: string | null;
  parser: string | null;
  schedule: string | null;
  rate: SourceRateResponse | null;
  url: string | null;
  license: string | null;
  tos_url: string | null;
  last_success_at: number | null;
  success_rate_7d: number;
}

export interface SourcesResponse {
  data: SourceResponse[];
}

export interface CoverageByJurisdiction {
  country_code: string;
  jurisdiction_code: string;
  n: number;
}

export interface CoverageByBenefitType {
  benefit_type: ApiBenefitType | null;
  n: number;
}

export interface CoverageResponse {
  byJurisdiction: CoverageByJurisdiction[];
  byBenefit: CoverageByBenefitType[];
}

export interface HealthResponse {
  ok: boolean;
  service: string;
}
