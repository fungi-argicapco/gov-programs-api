# Operational Scripts

Bun-based scripts that wrap common operational flows:

- `setup.ts`, `setup.sh` – Local and remote bootstrap.
- `deploy.ts` – Cloudflare deployment including asset rebuilds.
- `ingest-once.ts` – Local ingestion runner against SQLite.
- `postdeploy.validate.ts` – Post-deployment SLA checks.
- `ops.snapshot.ts`, `seed_lookups.ts` – Data utilities for operators.
- `generate-techland-dataset.ts`, `generate-cognitiveos-dataset.ts` – Convert research JSONL datasets into typed ingestion modules.

Scripts run in the Bun runtime; avoid Node-specific APIs and keep parity with Cloudflare Workers constraints.
