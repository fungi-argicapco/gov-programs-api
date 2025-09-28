CREATE TABLE IF NOT EXISTS country_playbooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT NOT NULL,
  version TEXT,
  last_updated TEXT,
  doc_owner TEXT,
  document_control TEXT,
  executive_summary TEXT,
  snapshot TEXT,
  segmentation TEXT,
  value_proposition TEXT,
  ecosystem TEXT,
  product_localization TEXT,
  regulatory_compliance TEXT,
  pricing_packaging TEXT,
  go_to_market TEXT,
  service_support TEXT,
  operations_people TEXT,
  financial_plan TEXT,
  milestones TEXT,
  raid TEXT,
  regional_focus TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(country)
);

CREATE INDEX IF NOT EXISTS idx_country_playbooks_country
  ON country_playbooks (country);
