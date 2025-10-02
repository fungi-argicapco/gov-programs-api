export type AutomationMetadata = {
  endpoint: string;
  parameters: Record<string, string>;
  authentication: 'none' | 'api_key' | 'app_token' | 'user_agent' | 'manual';
  rateLimit?: string;
  updateCadence?: string;
  changeDetection?: string;
  statusPage?: string;
  readiness: 'yes' | 'partial' | 'no';
  sourceUrl: string;
  verificationDate: string;
  notes?: string;
};

export type MacroMetricSource = {
  id: string;
  provider: 'worldbank';
  countryCode: string;
  adminUnitCode: string;
  adminUnitName: string;
  adminUnitLevel: string;
  metricGroup: string;
  metricName: string;
  metricUnit: string;
  indicatorId: string;
  request: {
    endpoint: string;
    parameters: Record<string, string>;
  };
  maxYears?: number;
  automation: AutomationMetadata;
  metadata?: Record<string, unknown>;
};

export type MacroMetricRecord = {
  sourceId: string;
  countryCode: string;
  adminUnitCode: string;
  adminUnitName: string;
  adminUnitLevel: string;
  metricGroup: string;
  metricName: string;
  metricUnit: string;
  metricYear: number;
  metricValue: number;
  valueText?: string;
  sourceUrl: string;
  verificationDate: string;
  automationMetadata: AutomationMetadata;
  metadata?: Record<string, unknown>;
};
