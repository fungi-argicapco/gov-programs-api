# Operational Scripts

Bun-based scripts that wrap common operational flows:

- `setup.ts`, `setup.sh` – Local and remote bootstrap.
- `deploy.ts` – Cloudflare deployment including asset rebuilds.
- `ingest-once.ts` – Local ingestion runner against SQLite.
- `postdeploy.validate.ts` – Post-deployment SLA checks.
- `ops.snapshot.ts`, `seed_lookups.ts` – Data utilities for operators.
- `generate-techland-dataset.ts`, `generate-cognitiveos-dataset.ts`, `generate-macro-dataset.ts`, `generate-climate-metrics-dataset.ts` – Convert research datasets into typed ingestion modules. The climate generator fetches subdivision crosswalks from Wikidata (with overrides under `data/climate_esg`) and produces seed bundles consumed by the ingestion worker.
- `fetch-climate-datasets.ts` – Optional CLI for downloading ND-GAIN, Aqueduct, INFORM, EPI, and UNEP research files (or converting local exports) into normalized JSON snapshots ready for upload to R2.

Scripts run in the Bun runtime; avoid Node-specific APIs and keep parity with Cloudflare Workers constraints.
