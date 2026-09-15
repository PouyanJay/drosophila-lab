# Local edition verification — 15 September 2026

## Passed

- Standard Next production build, static generation and TypeScript.
- Six persistence tests using PGlite (actual embedded Postgres), with the production records handlers and SQL adapter:
  - independent conversations and more than 60 messages;
  - rename preservation and reopening the on-disk database;
  - exact browser result round-trip, including weights, held-out trials and provenance;
  - invalid evidence rejection, pagination and anonymous-role access denial;
  - failed-save retry and protection against dropping a newer pending revision.
- Production HTTP startup and request checks: localhost returns 200; a foreign Host, Origin or cross-site request returns 403.
- Local morphology response for a bundled neuron returns 200 without network fetching.
- Launcher, backup and restore scripts pass Node syntax checks.
- Pinned Supabase CLI installed with checksum verification; local configuration is accepted by the CLI.

## Not verified in this environment

- Docker daemon access is unavailable. The complete Supabase + trainer startup, Python Postgres adapter, Docker lifecycle integration, backup and restore must be exercised on a Docker-enabled machine.
- Update: PyTorch was installed for the discovery implementation. The trainer and discovery tests and a real full-graph smoke campaign now pass; see validation-discovery.md. No improved brain is claimed by that small smoke campaign.
- Browser screenshot QA could not run: Chromium was absent and its download failed. HTTP checks do not verify visual appearance or WebGPU execution.
- OpenAI and Claude live calls require the user's credentials and were not exercised.

The included `scripts/test-local-stack.mjs` provides the remaining real training smoke check after local startup. This release is implemented and build-tested, but the Docker integration is not yet verified end to end.
