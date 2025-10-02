Shared package guidelines (see root AGENTS.md for global constraints):

- Maintain backwards compatibility for exports consumed by Workers unless the change is coordinated across services.
- Keep TypeScript strict mode passing; add tests under the parent service where appropriate.
- Update README files and docs when adding new shared modules or external dependencies.
