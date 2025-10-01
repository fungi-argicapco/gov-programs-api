-- Schema extensions for playbook data foundations

-- Funding program enrichment columns
ALTER TABLE programs ADD COLUMN program_category TEXT;
ALTER TABLE programs ADD COLUMN investor_thesis TEXT;
ALTER TABLE programs ADD COLUMN funding_min_value INTEGER;
ALTER TABLE programs ADD COLUMN funding_max_value INTEGER;
ALTER TABLE programs ADD COLUMN funding_currency TEXT;
ALTER TABLE programs ADD COLUMN funding_bracket TEXT;
ALTER TABLE programs ADD COLUMN application_status TEXT;
ALTER TABLE programs ADD COLUMN problem_keywords TEXT;
ALTER TABLE programs ADD COLUMN esg_focus TEXT;
ALTER TABLE programs ADD COLUMN verification_date TEXT;
ALTER TABLE programs ADD COLUMN data_refresh_frequency TEXT;
ALTER TABLE programs ADD COLUMN contact_channel TEXT;
ALTER TABLE programs ADD COLUMN notes_internal TEXT;
ALTER TABLE programs ADD COLUMN automation_ready TEXT;
ALTER TABLE programs ADD COLUMN api_endpoint TEXT;
ALTER TABLE programs ADD COLUMN api_parameters TEXT;
ALTER TABLE programs ADD COLUMN api_authentication TEXT;
ALTER TABLE programs ADD COLUMN api_rate_limit TEXT;
ALTER TABLE programs ADD COLUMN api_update_cadence TEXT;
ALTER TABLE programs ADD COLUMN api_change_detection TEXT;
ALTER TABLE programs ADD COLUMN api_status_page TEXT;

-- Macro metrics
CREATE TABLE IF NOT EXISTS macro_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  admin_unit_code TEXT NOT NULL,
  admin_unit_name TEXT,
  admin_unit_level TEXT,
  metric_group TEXT,
  metric_name TEXT NOT NULL,
  metric_value REAL,
  value_text TEXT,
  metric_unit TEXT,
  metric_year INTEGER,
  source_url TEXT,
  verification_date TEXT,
  automation_metadata TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_macro_metrics_unit_metric
  ON macro_metrics (admin_unit_code, metric_name);

-- Industry clusters
CREATE TABLE IF NOT EXISTS industry_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  admin_unit_code TEXT NOT NULL,
  admin_unit_level TEXT,
  cluster_name TEXT NOT NULL,
  cluster_description TEXT,
  employment INTEGER,
  gdp_contribution REAL,
  growth_rate REAL,
  key_employers TEXT,
  partner_orgs TEXT,
  unsdg_alignment TEXT,
  problem_keywords TEXT,
  source_url TEXT,
  verification_date TEXT,
  automation_metadata TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_industry_clusters_unit
  ON industry_clusters (admin_unit_code);

-- Workforce ecosystem
CREATE TABLE IF NOT EXISTS workforce_ecosystem (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  admin_unit_code TEXT NOT NULL,
  admin_unit_level TEXT,
  program_name TEXT NOT NULL,
  provider TEXT,
  delivery_model TEXT,
  focus_area TEXT,
  capacity INTEGER,
  funding_sources TEXT,
  technology_partners TEXT,
  esg_focus TEXT,
  problem_keywords TEXT,
  source_url TEXT,
  verification_date TEXT,
  automation_metadata TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workforce_ecosystem_unit
  ON workforce_ecosystem (admin_unit_code);

-- Infrastructure assets
CREATE TABLE IF NOT EXISTS infrastructure_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  admin_unit_code TEXT NOT NULL,
  admin_unit_level TEXT,
  asset_name TEXT,
  asset_type TEXT NOT NULL,
  status TEXT,
  capacity_value REAL,
  capacity_unit TEXT,
  cost_estimate REAL,
  currency_code TEXT,
  owner TEXT,
  esg_rating TEXT,
  availability TEXT,
  location TEXT,
  source_url TEXT,
  verification_date TEXT,
  automation_metadata TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_infrastructure_assets_unit
  ON infrastructure_assets (admin_unit_code);

-- Regulatory profiles
CREATE TABLE IF NOT EXISTS regulatory_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  admin_unit_code TEXT NOT NULL,
  admin_unit_level TEXT,
  policy_area TEXT NOT NULL,
  description TEXT,
  requirement_level TEXT,
  risk_level TEXT,
  compliance_window TEXT,
  effective_date TEXT,
  review_date TEXT,
  mitigation_plan TEXT,
  source_url TEXT,
  verification_date TEXT,
  automation_metadata TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_regulatory_profiles_unit
  ON regulatory_profiles (admin_unit_code);

-- Partnerships
CREATE TABLE IF NOT EXISTS partnerships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  admin_unit_code TEXT NOT NULL,
  admin_unit_level TEXT,
  partner_type TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  thesis TEXT,
  offering TEXT,
  contact_channel TEXT,
  status TEXT,
  esg_focus TEXT,
  problem_keywords TEXT,
  capital_commitment REAL,
  currency_code TEXT,
  source_url TEXT,
  verification_date TEXT,
  automation_metadata TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_partnerships_unit
  ON partnerships (admin_unit_code);

-- Financial assumptions
CREATE TABLE IF NOT EXISTS financial_assumptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id TEXT NOT NULL,
  country_code TEXT NOT NULL,
  admin_unit_code TEXT NOT NULL,
  admin_unit_level TEXT,
  scenario_name TEXT,
  revenue_drivers TEXT,
  cost_drivers TEXT,
  sensitivity_inputs TEXT,
  timeline TEXT,
  notes TEXT,
  source_url TEXT,
  verification_date TEXT,
  automation_metadata TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_financial_assumptions_unit
  ON financial_assumptions (admin_unit_code);
CREATE INDEX IF NOT EXISTS idx_financial_assumptions_scenario
  ON financial_assumptions (scenario_id);

-- Capital stack entries
CREATE TABLE IF NOT EXISTS capital_stack_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id TEXT NOT NULL,
  country_code TEXT,
  admin_unit_code TEXT,
  instrument_type TEXT NOT NULL,
  provider TEXT,
  amount REAL,
  currency_code TEXT,
  terms TEXT,
  seniority TEXT,
  risk_mitigation TEXT,
  source_url TEXT,
  verification_date TEXT,
  automation_metadata TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_capital_stack_scenario
  ON capital_stack_entries (scenario_id);

-- Roadmap milestones
CREATE TABLE IF NOT EXISTS roadmap_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  admin_unit_code TEXT NOT NULL,
  admin_unit_level TEXT,
  milestone_name TEXT NOT NULL,
  description TEXT,
  start_date TEXT,
  end_date TEXT,
  owner TEXT,
  status TEXT,
  stage_gate TEXT,
  dependencies TEXT,
  risk_level TEXT,
  source_url TEXT,
  verification_date TEXT,
  automation_metadata TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_roadmap_milestones_unit
  ON roadmap_milestones (admin_unit_code);
