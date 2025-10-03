# Sprint 1 Plan: Climate Hazard Metrics & Program Dataset Expansion

This sprint kicks off immediately after Sprint 0 to deliver the first production-ready climate hazard metrics and expand the program dataset coverage that powers the worker. The sprint spans **two weeks** and runs three coordinated workstreams so data ingestion, licensing, and delivery stay in lockstep.

## Objectives
- ✅ Ingest and normalize priority climate hazard datasets (INFORM Subnational, FEMA NRI) into a unified long-format table ready for downstream analytics.
- ✅ Expand the program registry to new jurisdictions and stand up automation that tracks funding windows and capital-stack relationships.
- ✅ Establish governance guardrails and delivery surfaces so restricted climate datasets can ship once licensing is cleared.

## Workstreams & Tasks

### 1. Climate Hazard Normalisation
| Task | Owner | Status | Notes |
| --- | --- | --- | --- |
| Secure HDX credentials and automate INFORM subnational downloads via nightly scheduled job. | _Assignee_ | 🔜 | Store credentials in remote secret vault; script should rehydrate manifests into R2 for audit trail. |
| Build extractor + transformer for FEMA NRI tract-level hazard metrics and map to canonical hazard taxonomy. | _Assignee_ | 🔜 | Ensure hazard IDs align with existing `hazard_types` table; capture tract FIPS crosswalk. |
| Implement long-format `climate_hazard_metrics` table (Drizzle migration + seed) and populate via ingest pipeline. | _Assignee_ | 🔜 | Table should include `hazard_id`, `geoid`, `year`, `metric`, `value`, `source`. |
| Integrate WorldRiskIndex ingestion placeholder pending HDX legal approval. | _Assignee_ | ⏳ | Blocked by licensing; scaffold ingestion to enable rapid activation post-approval. |
| Add validation tests that confirm hazard coverage for the initial geographies (US states + pilot international regions). | _Assignee_ | 🔜 | Leverage Vitest with fixture snapshots for deterministic hazard counts. |

### 2. Program Dataset Expansion
| Task | Owner | Status | Notes |
| --- | --- | --- | --- |
| Extend ISO-3166-2 registry to cover additional EU/APAC countries plus U.S. state & district incentive programs. | _Assignee_ | 🔜 | Update registry script and regenerate TypeScript enums used by ingestion mappers. |
| Wire new program feeds into ingestion scheduler with jurisdiction gating flags. | _Assignee_ | 🔜 | Use environment toggles for beta feeds to avoid unintended cron activation. |
| Build application calendar generator that records funding windows + reminders into KV. | _Assignee_ | 🔜 | Calendar output should drive email/alert experiments; capture timezone metadata. |
| Link programs to capital-stack entries and partner data for blended-finance visibility. | _Assignee_ | 🔜 | Establish relational mapping table with referential integrity checks. |
| Author monitoring jobs that alert when upcoming deadlines lack active promotion. | _Assignee_ | 🔜 | Emit metrics/diffs for Slack routing or dashboard surfacing. |

### 3. Data Governance & Delivery Enablement
| Task | Owner | Status | Notes |
| --- | --- | --- | --- |
| Draft SOPs for restricted datasets (Germanwatch CRI, Yale EPI, UNEP Explorer) covering request → approval → storage. | _Assignee_ | 🔜 | Document encryption requirements and retention windows. |
| Implement automation playbooks (scripts + docs) that verify licensing before ingestion runs. | _Assignee_ | 🔜 | Gate ingestion commands on signed-off licenses; log audit events. |
| Define reporting endpoints/dashboard slices exposing climate metrics alongside program data. | _Assignee_ | 🔜 | Target `/v1/metrics/climate` API plus Looker/Metabase dashboard specs. |
| Coordinate legal/licensing follow-ups once climate hazard table or program expansions land. | _Assignee_ | 🔜 | Track blockers in shared project board with owner + next action. |

## Deliverables Checklist
- [ ] Drizzle migration + seeds for `climate_hazard_metrics` committed with unit tests.
- [ ] INFORM + FEMA ingestion jobs scheduled via cron with HDX credential handling documented.
- [ ] Extended ISO-3166-2 registry and jurisdiction toggles shipped with coverage tests.
- [ ] Application calendar KV writer with monitoring hooks operational in staging.
- [ ] Governance SOPs and automation playbooks merged into `docs/` with legal review sign-off.
- [ ] Reporting endpoints or dashboards exposing combined climate/program insights available for demo.

## Dependencies & Risks
- **Licensing approvals:** WorldRiskIndex and restricted datasets remain blocked pending HDX/Germanwatch agreements. Mitigate by shipping scaffolding and using feature flags.
- **Cloudflare limits:** Ensure new cron jobs respect account-level scheduler quotas; coordinate with platform infra for additional slots.
- **Data volume:** FEMA NRI datasets are large; plan for chunked downloads and compression when storing in R2.
- **Jurisdiction complexity:** Expanding ISO-3166-2 introduces multilingual naming—validate locale fallbacks and ensure ingestion supports Unicode.

## Metrics & Exit Criteria
- Climate hazard coverage includes ≥90% of U.S. states with INFORM + FEMA metrics populated for latest year.
- At least 5 new jurisdiction program feeds enabled with active ingestion snapshots and funding window calendars.
- Governance SOPs adopted with sign-off from legal, and automation rejects ingestion if licensing metadata missing.
- `/v1/metrics/climate` (or equivalent dashboard) returns combined climate/program metrics suitable for stakeholder review.

## Follow-up & Future Sprints
- Once WorldRiskIndex access arrives, activate the ingestion job and backfill historical metrics.
- Split subsequent sprints into data ingestion versus legal/licensing follow-ups if blockers persist.
- Feed learnings into Sprint 2 (Enrichment & Coverage Expansion), especially NAICS tagging for the new program feeds and hazard metrics.
