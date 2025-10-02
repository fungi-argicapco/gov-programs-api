Operational scripting guidelines:
- Use Bun and keep dependencies minimal; scripts should run locally and in CI.
- Apply database migrations before performing write operations (`migrations/*.sql`).
- Log clearly when scripts expect Cloudflare credentials or mutate remote resources.
- Document new scripts in this README and update docs/ARCHITECTURE.md if they introduce new automation paths.
