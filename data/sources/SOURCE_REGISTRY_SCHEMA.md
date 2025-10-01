# Source Registry Schema

Each row in the source registry must provide metadata the ingestion framework
needs to automate data refreshes across every dataset powering the TechLand
Playbook. Use the table below for column definitions.

| Column | Description |
| --- | --- |
| `category` | Dataset category (macro_metrics, industry_clusters, workforce_ecosystem, infrastructure_assets, regulatory_profiles, partnerships, financial_assumptions, capital_stack, roadmap, funding_programs). |
| `country_code` | ISO 3166-1 alpha-2 country code. |
| `admin_unit_level` | Administrative level descriptor (e.g., country, state, province, region, district). |
| `admin_unit_code` | ISO 3166-2 code or other canonical identifier. |
| `admin_unit_name` | Human-readable name of the administrative unit. |
| `api_endpoint` | Canonical machine-readable endpoint or structured download URL. |
| `api_parameters` | JSON or key=value list describing required parameters/payload. Use `N/A` if none. |
| `api_authentication` | Authentication requirements (none, api_key, oauth, manual, restricted). |
| `api_rate_limit` | Published rate limit details or `unknown`. |
| `api_update_cadence` | Update frequency (daily, weekly, monthly, ad-hoc, event-driven, unknown). |
| `api_change_detection` | Change detection support (ETag, Last-Modified, delta endpoints, none). |
| `api_status_page` | URL to API status or developer portal; `N/A` if none. |
| `automation_ready` | `yes`, `partial`, or `no`. `partial` indicates a scraper/manual step is required. |
| `source_url` | Reference URL to API documentation or data portal. |
| `verification_date` | YYYY-MM-DD date of last verification. |
| `notes_internal` | ≤280 characters with caveats, licensing, scraping instructions. |
