# Development Sprints Roadmap

This roadmap sequences the Phase 2 scope into themed sprints that align ingestion, enrichment, and platform capabilities for the US & Canada MVP. Each sprint lists its goals, primary deliverables, and representative backlog items.

## Next Sprint Focus

### Climate Hazard Normalization
- [Sprint 1 plan with detailed workstreams](./sprint-1-climate-program-expansion.md)
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
