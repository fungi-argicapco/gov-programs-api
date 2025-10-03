# Development Sprints Roadmap

This roadmap sequences the Phase 2 scope into themed sprints that align ingestion, enrichment, and platform capabilities for the US & Canada MVP. Each sprint lists its goals, primary deliverables, and representative backlog items.

## Next Sprint Focus

### Climate Hazard Normalisation
- Automate INFORM subnational downloads via HDX credentials.
- Ingest FEMA NRI tract-level and hazard-specific metrics.
- Stand up the long-format `climate_hazard_metrics` table.
- Add WorldRiskIndex once HDX access is approved.

### Program Dataset Expansion
- Extend the ISO-3166-2 registry beyond the initial seven countries, covering state/district incentives and EU/APAC program feeds.
- Build application calendars and monitoring jobs for funding windows.
- Link programs to capital-stack entries and partner data to support blended-finance tooling.

### Data Governance & Delivery
- Establish automation playbooks and SOPs for restricted datasets (Germanwatch CRI, Yale EPI, UNEP Explorer) once licensing approvals arrive.
- Define reporting endpoints or dashboard slices that surface the new ESG/climate metrics alongside program data for playbook consumers.
- Once the climate hazard table or program expansions are in flight, split subsequent sprints into data ingestion versus legal/licensing follow-ups as needed.

#### Codex Task Queue
| Priority | Task | Scope Notes | Completion Signal |
| --- | --- | --- | --- |
| P0 | Automate INFORM subnational harvests | Extend `apps/ingest` scheduled jobs to authenticate against HDX, persist source manifests to `data/inform/`, and document credential handling in `docs/LICENSING.md`. | Nightly cron captures the latest INFORM CSVs and updates the raw dataset snapshot in Git. |
| P0 | Model FEMA NRI tract metrics | Introduce a D1 migration for the long-format `climate_hazard_metrics` table, wire ingestion mappers for FEMA exports, and validate type coverage with Vitest fixtures. | Migration succeeds locally (`bun run migrate:local`) and ingestion populates metrics for at least one FEMA hazard. |
| P1 | Expand ISO-3166-2 registry | Update `data/iso_crosswalk.csv` with EU/APAC regions plus U.S. state/district incentives and regenerate any derived lookups consumed by the API. | `bun run typecheck` stays green and region filters expose the new jurisdictions. |
| P1 | Build funding window monitors | Add cron-friendly calendar builders in `apps/ingest` that emit application window events to KV or D1, paired with dashboard notes in `docs/ingestion-observability.md`. | Scheduled job run logs upcoming deadlines and dashboards reference the generated feed. |
| P2 | Link programs to capital stack data | Join program records with partner capital-stack entries in persistence models and surface linkage fields via `/v1/programs` responses. | API responses include partner linkage metadata with accompanying schema documentation updates. |
| P2 | Draft restricted dataset SOPs | Create playbooks in `docs/admin-runbooks.md` detailing access workflows and compliance steps for CRI, EPI, and UNEP Explorer datasets once licensing clears. | Runbooks merged with sign-off from data governance reviewers. |

#### Final Codex Session Seeds
Each seed captures a ready-to-run Codex session, aligning scope, guardrails, and validation so we can close the sprint without additional grooming.

1. **Seed 1 – Climate Hazard Backbone**
   - **Objective:** Ship the `climate_hazard_metrics` schema, FEMA NRI ingestion path, and fixture validation called out in the P0 queue items.
   - **Entry Criteria:** `apps/ingest` worker scaffolding confirmed via `bun run typecheck`; FEMA sample CSV available in `data/fema/fixtures/`.
   - **Exit Criteria:** New D1 migration merged, ingestion harness writes to the long-format table, and Vitest snapshots capture at least wind and flood hazards. Update `docs/ARCHITECTURE.md` with the metric flow diagram.

2. **Seed 2 – INFORM + WorldRiskIndex Automation**
   - **Objective:** Build the HDX-authenticated fetcher, persist manifests, and draft the WorldRiskIndex ingestion toggle so HDX data can land alongside FEMA metrics.
   - **Entry Criteria:** HDX credentials stored in the secret manager with wrangler bindings documented; `docs/LICENSING.md` section stubbed for INFORM restrictions.
   - **Exit Criteria:** Scheduled job downloads nightly INFORM data, a feature flag controls WorldRiskIndex ingestion, and documentation covers credential rotation plus failure recovery.

3. **Seed 3 – Program Expansion & Governance Finish Line**
   - **Objective:** Complete ISO-3166-2 expansion, application calendar monitors, and restricted dataset SOPs needed for blended-finance workflows.
   - **Entry Criteria:** Latest jurisdiction mapping spreadsheet imported to `data/iso_crosswalk.csv`; dashboard skeleton ready to accept new calendar panels.
   - **Exit Criteria:** API exposes expanded jurisdictions, monitoring jobs emit upcoming deadlines, and `docs/admin-runbooks.md`/`docs/ingestion-observability.md` reflect the new governance processes.

## Sprint 0: Environment & Baseline Quality (1 week)
**Goal:** Ensure every contributor can bootstrap, test, and deploy the worker confidently.

[Execution plan & checklist](./sprint-0-environment.md)

**Deliverables**
- Verified local setup scripts and documentation updates covering Bun-only workflows and Cloudflare prerequisites.
- Passing baseline automation: `bun run typecheck`, `bun test`, and `bunx wrangler dev` smoke validation.
- Hardened migration runbooks for D1 schemas up to `0010_canvas_onboarding.sql`, including dry-run guidance, rollback verification, and checkpointed schema validation steps.

**Backlog Highlights**
- Run and document `bun install`, `bash codex/env.setup.sh`, and `bun run setup:local`, calling out `.env.dev.local` values to unblock `wrangler dev` usage so new contributors don't stall on missing Cloudflare bindings.
- Capture production secret requirements (`CLOUDFLARE_*`, `PROGRAM_API_BASE`, `EMAIL_*`) in launch docs and verify `bun run setup:remote` idempotence.
- Exercise `bun run deploy` in a sandbox, confirming DNS enforcement behavior and Durable Object prerequisites.

## Sprint 1: Live Source Catalog Launch (2 weeks)
**Goal:** Replace fixture-driven ingestion with the Phase 2 live source catalog and adapters.

**Deliverables**
- Implemented `data/sources/phase2.ts` catalog entries for Grants.gov, SAM Assistance, Canada Open Government, and Ontario CKAN feeds with mapper registry wiring.
- Catalog dispatcher powering the ingestion worker, including shared rate limiting and snapshot writes when R2 is configured.
- Updated `/v1/sources` metadata reflecting live source properties.

**Backlog Highlights**
- Extend catalog entries with authentication, throttle, and jurisdiction metadata; gate high-volume feeds via environment flags.
- Update JSON/RSS/HTML adapters for pagination, token-based auth, deduplication, and structured error envelopes.
- Validate mapper functions (`mapGrantsGov`, `mapSamAssistance`, `mapCkanGC`, `mapCkanProvON`) against sample payloads; add fixture-based tests.

## Sprint 2: Enrichment & Coverage Expansion (2 weeks)
**Goal:** Deliver NAICS-driven tagging, coverage validation, and enhanced coverage APIs.

**Deliverables**
- `industry_mappings`, `coverage_audit`, and related schema migrations wired into Drizzle models.
- Enrichment pipeline that merges adapter tags with NAICS-derived tags during ingestion and via nightly backfill.
- `/v1/stats/coverage` enhancements exposing tag/NAICS coverage, validation issues, and persisted coverage reports.

**Backlog Highlights**
- Integrate `enrichNaics` with Cloudflare KV fallbacks and ensure ingestion gracefully degrades when lookups are missing.
- Implement coverage validation rules for program completeness, temporal validity, and jurisdiction totals.
- Update OpenAPI schema, response serializers, and tests to cover new coverage payload structures.

## Sprint 3: Ingestion Observability & Diffing (1 week)
**Goal:** Track ingestion health, run metrics, and content diffs for proactive monitoring.

**Deliverables**
- `ingestion_runs`, `program_diffs`, and `snapshot_diffs` persistence with adapters emitting structured metrics.
- CLI tooling (`bun run ingest:once --source=...`) that surfaces run outcomes and diff summaries locally.
- Alerting hooks or dashboards (e.g., Cloudflare Logpush or Metrics API) for error-rate thresholds.

**Backlog Highlights**
- Wrap dispatcher execution with run lifecycle tracking, surfacing `partial` vs `error` outcomes and notes.
- Build JSON diff utility that ignores noisy fields while flagging critical changes (status, funding, deadlines).
- Document observability workflows and add Vitest coverage for diffing and failure paths.

## Sprint 4: Account & Canvas Experience Hardening (1 week)
**Goal:** Solidify authentication flows and Canvas CRUD ahead of broader rollout.

**Deliverables**
- End-to-end tests covering account request approval, invite acceptance, login, MFA enrolment, and session refresh.
- Canvas API validation for version history, status transitions, and content schema assertions.
- Email notification templates verified against Cloudflare Email Routing or logging sinks.

**Backlog Highlights**
- Ensure session rotation, logout, and MFA-required flows align with the documented API contract.
- Harden `email_tokens` lifecycle and expirations for invites and MFA using Vitest + fixture data.
- Add admin runbooks for approving requests, revoking sessions, and archiving canvases.

## Sprint 5: Launch Readiness & Expansion (1 week)
**Goal:** Prepare for production rollout and set up guardrails for jurisdiction expansion.

**Deliverables**
- Updated launch checklist confirming ingestion SLA adherence, NAICS density targets, and observability dashboards.
- Progressive rollout plan for additional U.S. states and Canadian provinces, including data quality exit criteria.
- Post-deploy validation scripts and dashboards for `/v1/sources` freshness and coverage trends.

**Backlog Highlights**
- Dry-run ingestion with staged cron + fixtures, ensuring graceful degradation without live network access.
- Configure alert thresholds (e.g., error rate >20%, stale sources >24h) and response playbooks.
- Review retention policy for R2 snapshots (e.g., 90-day window) and automate cleanup tasks.

## Ongoing Initiatives
- Keep Bun type checking, tests, and ingestion dry-runs green in CI.
- Maintain documentation for Cloudflare credentials, DNS overrides, and Durable Object requirements.
- Track success metrics: ≥5 live sources, ≥90% programs with NAICS/tags, ingestion diffs surfaced within 15 minutes.
- Climate backlog: automate INFORM subnational manifests (HDX credential flow), ingest FEMA NRI tract-level + hazard metrics, add WorldRiskIndex ingestion once HDX permissions are granted, and implement the unified `climate_hazard_metrics` table described in the INFORM/NRI deep-dive. Document legal clearances before expanding restricted datasets (per `docs/LICENSING.md`).
- Programs backlog: broaden the ISO-3166-2 program registry with EU/APAC sources and state/district incentives, build notification/application calendars, and connect programs to capital-stack datasets for blended-finance workflows.
