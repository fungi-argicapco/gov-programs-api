# Progressive Rollout Plan for Jurisdiction Expansion

This plan guides how to extend the live source catalog beyond the initial US federal and Ontario feeds. It groups jurisdictions into cohorts, defines validation checkpoints, and links operational guardrails to maintain ingestion quality as coverage grows.

## Objectives
- Expand coverage methodically across additional U.S. states and Canadian provinces/territories.
- Preserve ingestion SLAs and NAICS/tag density targets during each rollout wave.
- Provide clear exit criteria before promoting a cohort from staging to production traffic.

## Cohort sequencing
1. **Cohort A – High-volume U.S. states**
   - Target: California, New York, Texas.
   - Requirements: adapter readiness with rate limiting, fixture-backed dry runs, double-ingest comparison against legacy fixtures.
2. **Cohort B – Remaining U.S. states**
   - Sequence in batches of 5–7 states grouped by data portal similarity.
   - Requirements: ensure credential or API key workflows are documented before enabling scheduled ingestion.
3. **Cohort C – Canadian provinces and territories**
   - Prioritise British Columbia and Québec, followed by prairie provinces and Atlantic regions.
   - Requirements: bilingual content handling verified in enrichment, and CKAN-based feeds tuned for pagination.

Each cohort should be gated behind environment flags (`INGEST_SOURCES_ALLOWLIST`) so they can be enabled per environment.

## Exit criteria per cohort
- **Ingestion freshness**: 100% of cohort sources have `last_success_at` within SLA (≤6h for `4h`, ≤30h for `daily`) over a rolling 72-hour window.
- **Run stability**: 7-day success rate ≥85% and no more than one consecutive `partial` or `error` status per source.
- **Coverage quality**: `/v1/stats/coverage` reports ≥90% NAICS density and ≥95% tag coverage for programs originating from the cohort jurisdictions.
- **Diff monitoring**: Critical diffs reviewed and signed off in the runbook for at least two consecutive successful runs.
- **Alerting**: Error rate (>20%) and stale source (>24h) alerts configured with on-call playbooks acknowledging test pages in staging.

## Operational guardrails
- **Dry-run ingestion**: Run `bun run ingest:once --source=<id>` against staged fixtures before enabling cron. Ensure failure modes are documented in the source adapter README.
- **Staged cron rollout**: Enable new sources via staggered cron entries (e.g., every 30 minutes offset per source) to avoid burst load while monitoring metrics.
- **Snapshot retention**: Apply a 90-day retention policy to R2 snapshots using the cleanup script (see below) before scaling cohorts.
- **Rollback strategy**: Maintain feature flags to disable problematic sources quickly and provide a procedure to replay the most recent good snapshot.

## Dashboard and alert readiness
- `/v1/sources` freshness heatmap grouped by jurisdiction with stale (>SLA) highlighting.
- `/v1/stats/coverage` trend chart showing NAICS density and tag coverage for the last 14 days, broken out by cohort tags.
- Ingestion run timeline with error-rate overlay and annotations for rollout milestones.
- Alert routing that pages ops when error-rate or stale-source thresholds are exceeded, with Slack notifications for NAICS density dips below 90%.

## Automation hooks
- **Post-deploy validation**: `bun run postdeploy:validate --base-url=<environment-url>` captures SLA adherence and coverage metrics; archive JSON outputs per deploy.
- **Snapshot cleanup**: Schedule `bun run scripts/ops.snapshot.ts` (or the dedicated cleanup task when available) weekly to enforce the 90-day retention window.
- **Diff reviews**: Pipe `program_diffs` marked `critical` into the review workflow and document approval in the cohort rollout checklist.

## Documentation & handoff
- Update the Cloudflare credentials and DNS override docs as new domains or namespaces are introduced for jurisdiction-specific workers.
- Record Durable Object or KV provisioning deltas that differ from the baseline setup scripts.
- Maintain a living checklist in the runbook linking to fixture data, adapter owners, and rollout status for each jurisdiction.
