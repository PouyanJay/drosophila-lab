# Contributing

## Setup and checks

Install the locked dependencies and run repository checks:

```sh
make setup
make check
```

The installer runs the pnpm version pinned in `package.json`; a global pnpm or Corepack installation is unnecessary. Use `npx pnpm@11.25.0 add PACKAGE` when intentionally changing dependencies, and commit the resulting lockfile.

`make check` aggregates formatting, route/type generation, lint, agent validation, web/Python tests, browser/research checks, and the production build. Docker is not required for these checks. Direct `npm test` also requires uv for the lifecycle lock tests. Provider and trainer HTTP calls in those tests are mocked. Full-graph CPU checks take longer than the small unit tests.

Use `make run` to start the full local development environment. Python is managed by `uv`, with Python 3.11 selected automatically and exact dependencies in `uv.lock`:

```sh
uv sync --frozen
make test-python
make lint
```

Use `uv add` (or `uv add --group dev`) to change dependencies and commit the updated lock. No manual virtualenv activation or system pip installation is needed. `research/lab/requirements.lock` and the archived requirements remain part of the historical downloadable trainer; the maintained local Docker image uses `uv.lock`.

The Makefile follows [Lunaris's adapted conventions](.claude/docs/reference/MAKEFILE.md). `make help` lists all commands. `make run` bootstraps Node/uv when needed, synchronizes dependencies, starts Docker/Supabase/trainer, applies migrations, and reports the actual website URL. Repeated invocations reuse healthy owned services. See [Local workspace](docs/local-workspace.md) for platform prerequisites, ports, logs, stop/recovery, and backups.

## Coding agents

Read [CLAUDE.md](CLAUDE.md), also exposed as `AGENTS.md`. Shared skills live in `.claude/skills`, exposed to Codex through `.agents/skills`. Claude reviewers live in `.claude/agents` and have corresponding `.codex/agents` registrations. Use `make check-agents` to verify discovery/metadata and Git visibility. All these files belong in Git; do not add them to ignore rules. See [Toolkit adaptation](.claude/ADAPTATION.md) for the inventory and intentionally omitted Lunaris-specific tooling.

## Where code belongs

See [Architecture](docs/architecture.md) for the directory map and dependency rules.

- Keep routes focused on HTTP request/response handling. Share validation through `src/lib/contracts` and keep credentials/database access in `src/server`.
- Put feature components and their styles together. Share UI across features through `src/components`; share browser behavior through `src/hooks` or `src/lib/client`.
- Use `@/` imports for application modules. That alias always points to `src/`.
- Use parameterized Postgres queries; never concatenate request values into SQL.
- Format maintained web code with `npm run format`. Preserve upstream UI assets and scientific snapshots according to the exclusions described in the architecture guide.
- Add behavioral tests when changing persistence, protocols, computation, or lifecycle transitions. Avoid tests that merely repeat the implementation.

## Existing lint debt

The initial source has substantial loose typing and React lifecycle debt. `.eslint-suppressions.json` records existing **error counts per file and rule** using ESLint's bulk-suppression mechanism. Rules remain enabled; a new file starts with no allowance. The default lint command also caps the existing warnings at 19.

`npm run lint:debt` displays the unsuppressed findings and intentionally fails while that debt exists. Do not regenerate or increase the suppression baseline to pass a change. Fix the underlying issue, then use:

```sh
npx pnpm@11.25.0 exec eslint . --suppressions-location .eslint-suppressions.json --prune-suppressions
```

A count baseline cannot detect replacing one existing finding with another in the same file; review remains necessary. Prioritize typed atlas/run/worker payloads and the large studio component's session, job, and playback lifecycles.
