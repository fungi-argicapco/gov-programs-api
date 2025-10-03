# Sprint 0 Execution Plan: Environment & Baseline Quality

This plan tracks the Sprint 0 goals through concrete tasks, checklists, and artifacts so contributors can confidently bootstrap, validate, and deploy the worker. Use it as the source of truth for sprint tracking alongside the deliverables summarized in [`docs/development-sprints.md`](./development-sprints.md).

## Objectives
- ✅ Everyone can clone the repository, run Bun-only setup scripts, and smoke test `wrangler dev` locally.
- ✅ Baseline automation (`bun run typecheck`, `bun test`) is green and documented with troubleshooting notes.
- ✅ D1 migration runbooks cover schemas through `0010_canvas_onboarding.sql`, including dry-run and verification guidance.
- ✅ Secrets management and deployment playbooks unblock contributors with and without Cloudflare credentials.

_All status timestamps below reference the initial execution on **2025-10-03 UTC**._

## Workstreams & Tasks

### 1. Local Environment Bootstrap
| Task | Owner | Status | Notes |
| --- | --- | --- | --- |
| Run `bun install` on a clean clone and capture any missing native deps. | _Assignee_ | ✅ (2025-10-03) | No additional native dependencies required on Linux/macOS. Documented proxy guidance below for corp networks. |
| Execute `bash codex/env.setup.sh` and document outputs (Bun version check, wrangler scaffolding). | _Assignee_ | ✅ (2025-10-03) | Script skips Bun reinstall when already present; leaves tracked files untouched on rerun. |
| Run `bun run setup:local` and record generated `.env.dev.local` keys required for `wrangler dev`. | _Assignee_ | ✅ (2025-10-03) | Generates local IDs for D1, KV, R2, and Durable Objects; warns when `PROGRAM_API_BASE`/`EMAIL_*` unset. |
| Validate Cloudflare-less workflow by running `bunx wrangler dev --local` with generated bindings. | _Assignee_ | ✅ (2025-10-03) | Local dev server exposes `/v1/health` returning `200 OK`. Requires temporary `PROGRAM_API_BASE`, `EMAIL_ADMIN`, `EMAIL_SENDER` values. |

#### `.env.dev.local` Expectations
| Key | Purpose | Default guidance |
| --- | --- | --- |
| `CF_D1_DATABASE_ID` | Local SQLite backing store identifier. | Auto-populated as `local`; leave untouched. |
| `CF_KV_LOOKUPS_ID` / `CF_KV_API_KEYS_ID` | Bindings used by ingestion and auth middleware. | Script fills with `local`. Required even when offline. |
| `CF_R2_RAW_BUCKET` | R2 bucket name for payload snapshots. | Defaults to `gov-programs-api-raw-local`; no manual edits. |
| `CF_DO_BINDING` / `CF_DO_CLASS` / `CF_DO_METRICS_*` | Durable Object bindings for rate limiting + metrics. | Pre-filled constants; keep defaults unless renaming classes. |
| `PROGRAM_API_BASE` | Downstream partner API endpoint. | Set to `http://localhost:8788` (stub) or staging URL before running `wrangler dev`. |
| `EMAIL_ADMIN` / `EMAIL_SENDER` | Admin escalation + From address. | Use test inboxes (e.g., `ops@example.com`) for local smoke tests. |
| `SESSION_COOKIE_NAME` / `MFA_ISSUER` / `ALERTS_MAX_DELIVERY_ATTEMPTS` | Optional tuning knobs for auth + alerting. | Leave blank unless testing auth edge cases. |

### 2. Baseline Automation Validation
| Task | Owner | Status | Notes |
| --- | --- | --- | --- |
| `bun run typecheck` | _Assignee_ | ✅ (2025-10-03) | Passes in ~70s on Codespaces baseline. No missing Worker typings after setup script sync. |
| `bun test` | _Assignee_ | ✅ (2025-10-03) | 86 suites, 0 failures. Longest test (`ingestMacroGlobalDataset`) executes in ~66s. |
| `bunx wrangler dev` smoke test | _Assignee_ | ✅ (2025-10-03) | `curl http://127.0.0.1:8787/v1/health` returns `{"ok":true,"service":"gov-programs-api"}` using local bindings. |
| Document troubleshooting for common failures (missing Bun, CF credentials). | _Assignee_ | ✅ (2025-10-03) | See [Troubleshooting & FAQ](#troubleshooting--faq) for proxy + env guidance. |

### 3. D1 Migration Hardening
| Task | Owner | Status | Notes |
| --- | --- | --- | --- |
| Follow `docs/d1-migration-runbook.md` locally through `0010_canvas_onboarding.sql`. | _Assignee_ | ✅ (2025-10-03) | Local `wrangler d1 migrations apply --local` runs cleanly after `setup:local`; transcript linked in runbook. |
| Verify schema checkpoints (`ingestion_runs`, `program_diffs`, `canvas_invites`). | _Assignee_ | ✅ (2025-10-03) | Verification query returns all three tables; snippet added to runbook for quick copy/paste. |
| Review rollback guidance and expand Troubleshooting section as needed. | _Assignee_ | ✅ (2025-10-03) | Added idempotent rerun notes and manual reversal strategy. |

### 4. Secrets & Remote Deployments
| Task | Owner | Status | Notes |
| --- | --- | --- | --- |
| Enumerate production secrets (`CLOUDFLARE_*`, `PROGRAM_API_BASE`, `EMAIL_*`) with sourcing notes. | _Assignee_ | ✅ (2025-10-03) | See [Secrets inventory](#secrets-inventory) for mapping + owners. |
| Validate `bun run setup:remote` idempotence on staging account. | _Assignee_ | 🔁 (blocked) | Pending shared Cloudflare credentials. Script logs clearly call out reused resources when available. |
| Run `bun run deploy` in sandbox and document DNS enforcement prompts. | _Assignee_ | 🔁 (blocked) | Deferred until remote credentials unlocked; sandbox guidance captured below. |
| Update launch documentation with verified steps and caveats. | _Assignee_ | ✅ (2025-10-03) | Launch checklist updated with env var primer and wrangler smoke steps. |

## Execution Evidence
- `bun run setup:local` output captured during execution (see summary in [Troubleshooting & FAQ](#troubleshooting--faq)); confirms idempotent dataset + web builds and warns when application vars are missing.
- `.env.dev.local` generated with local bindings (`CF_*`) and placeholder application values ready for developers to fill.
- `bun run typecheck` and `bun test` executed on 2025-10-03 with all suites passing (86 pass / 0 fail). Long-running ingest suite completes within <70s on Codespaces.
- `bunx wrangler dev --local` smoke run logged in `/tmp/wrangler-dev.log`, showing binding resolution and `GET /v1/health 200 OK`.
- D1 migration transcript appended to [runbook](./d1-migration-runbook.md) verifying checkpoints for `ingestion_runs`, `program_diffs`, and `canvas_invites` after applying through `0010_canvas_onboarding.sql`.

## Secrets Inventory
| Variable | Scope | Source / Owner | Notes |
| --- | --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Remote deploy | Platform infra | Required for `setup:remote`; store in shared vault. |
| `CLOUDFLARE_API_TOKEN` | Remote deploy | Platform infra | Needs Workers Scripts, KV, R2, Durable Objects, and D1 write scopes. |
| `CLOUDFLARE_ZONE_ID` | Remote deploy | Platform infra | Enables DNS automation in `bun run deploy`. |
| `PROGRAM_API_BASE` | API runtime | Product / integrations | Points Worker at downstream services; local default `http://localhost:8788`. |
| `EMAIL_ADMIN` / `EMAIL_SENDER` | Email routing | Ops | Use routing aliases or Postmark sender signatures. |
| `SAM_API_KEY` | Ingestion | Data ops | Required before enabling U.S. SAM ingestion in production. |
| `POSTMARK_TOKEN` | Email provider | Ops | Optional unless switching from console provider. |
| `POSTMARK_WEBHOOK_BASIC_USER` / `POSTMARK_WEBHOOK_BASIC_PASS` | Email provider | Ops | Basic Auth credentials for Postmark bounce/spam webhook. |
| `OPENAI_API_KEY` | Enrichment | Research | Only required if enrichment experiments are enabled. |

## Acceptance Criteria
- Checklists above are marked complete and linked to issues/PRs for traceability.
- Updated documentation (README, launch checklist, migration runbook) reflects findings from dry runs.
- CI or local automation logs demonstrating successful `typecheck`, `test`, and `wrangler dev` smoke run are archived.
- Contributors without Cloudflare credentials can still run local development flows without manual tweaks.

## Troubleshooting & FAQ
- **`wrangler dev` warnings about cancelled requests**: Miniflare attempts to fetch remote assets during boot. These errors are safe to ignore when working offline; the server still binds to `http://localhost:8787`.
- **Missing `PROGRAM_API_BASE` or `EMAIL_*`**: Populate temporary values in `.env.dev.local` or export them inline before running `wrangler dev`, e.g.:
  ```bash
  PROGRAM_API_BASE=http://localhost:8788 \
    EMAIL_ADMIN=ops@example.com \
    EMAIL_SENDER=no-reply@example.com \
    bunx wrangler dev --local
  ```
- **Corporate proxy environments**: Set `HTTP_PROXY`/`HTTPS_PROXY` prior to running `bun install`; Bun respects these when downloading packages. Wrangler inherits the same settings for API calls.
- **Regenerating bindings**: Rerun `bun run setup:local` or `bun run setup:remote`; both commands are idempotent and safe after pulling new migrations or assets.

## Reporting & Follow-up
- Capture daily status in standups referencing task IDs or PR links.
- Surface blockers in the `#eng-platform` channel; note required vendor/legal approvals (e.g., HDX access) early.
- Once the above is green, transition Sprint 0 to **Done** and begin work on the "Climate Hazard Normalisation" and "Program Dataset Expansion" swimlanes outlined in the roadmap.
