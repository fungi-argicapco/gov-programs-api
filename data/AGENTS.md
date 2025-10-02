Data directory guidelines:
- Commit only documentation-safe artifacts (source registries, prompts, sample lookups). Never store production secrets or PII.
- Update the source registry (`sources/source_registry.csv`) whenever ingestion metadata changes.
- Coordinate schema changes with `migrations/` and document corresponding data expectations in docs/ARCHITECTURE.md or research prompts.
- If climate-risk/ESG raw files change (`climate_esg/raw/`), rerun `bun run datasets:build` so the generated ingestion bundle and ISO crosswalk stay current.
