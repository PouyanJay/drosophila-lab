# Drosophila Lab project instructions

Read `docs/architecture.md` for the directory map and `docs/local-workspace.md` for operations. This is a local research instrument: Next.js/React/TypeScript UI and API, Python/PyTorch numerical trainer, and Supabase Postgres. It is not Lunaris, a LangGraph app, or a hosted multi-user service.

## Working agreement

Carry the user's requested work through implementation and relevant verification. Use existing context before asking questions; ask only for missing information that affects the outcome. Keep changes scoped and explain assumptions. Do not turn ordinary edits into mandatory ceremonies. Never commit, push, publish, provision paid services, or send messages solely because a skill suggests it; follow the user's authorization in the current task. Do not add automated co-author attribution to commits.

For substantial feature work use `journey`; for reviews use `codereview` or `security-review`; for UI changes apply `enterprise-ui`. Read selected skills before using them. Reviewers report evidence and do not modify files. Delegate independent reviews when the selected workflow calls for them and delegation is available; otherwise apply the same reviewer instructions sequentially and disclose that. Avoid duplicate test runs when current results already cover the unchanged diff.

## Commands and environment

- `make help`: discover the supported commands.
- `make run`: bootstrap tools/dependencies, start or reuse Docker services, allocate ports, apply migrations, and launch the website. Read the printed URL; do not assume port 3000.
- `make setup`: frozen pnpm install and `uv sync --frozen`.
- `make test`, `make test-python`, `make test-web`: run real behavior checks; suites aggregate failures.
- `make lint`, `make lint-fix`, `make build`, `make check`: formatting, types, lint, tests, and production compilation.
- `make status`, `make check-ports`, `make logs`, `make stop`: inspect or stop this project's services only. Preserve databases/checkpoints.
- Use `uv add`, `uv sync`, and `uv run --frozen` for maintained Python development; commit `uv.lock`. Never install into system Python. pnpm is pinned in `package.json`; commit `pnpm-lock.yaml`.
- Keep the Makefile a thin dispatcher. Runtime logic belongs in `scripts/`, with readable progress, bounded readiness checks, failure summaries, and safe idempotence. `make -j run` must not race setup against startup.

## Architecture and scientific invariants

- Pages/HTTP entrypoints: `src/app`; feature UI/styles: `src/features`; shared UI: `src/components`; browser helpers: `src/lib/client`; contracts/planning/validation: `src/lib`; private services: `src/server`.
- `@/` resolves to `src/`. Shared logic never imports features/routes/server services. Server modules carry `server-only`; browser code never handles decrypted credentials.
- Use native parameterized Postgres queries and migrations in `supabase/migrations`. The local `lab` schema denies anonymous/authenticated Supabase roles; do not replace that with a fictitious tenant/RLS design.
- Protect localhost and cross-origin checks, encrypted provider/trainer credentials, trainer owner scoping, durable job state, and retry identity.
- Numerical trainer source and archived public engines participate in checkpoint provenance. Do not mass-format `research/lab`, `research/versions`, the offline runner, public engines, datasets, or upstream UI assets. Review source-hash/archive consequences for intended numerical changes.
- Keep measured biology distinct from engineered copies and illustrative playback. Preserve graph hashes, source body IDs, seed/data split isolation, checkpoint selection, ablations, and held-out confirmation. Never fabricate measurements or imply biological superiority from small examples.
- Existing ESLint debt is recorded in `.eslint-suppressions.json`. Never increase it to pass checks. `make lint` enforces the current allowance; report existing debt separately from introduced issues.

## Tests and review

Read the relevant references in `.claude/docs/reference/`. New lifecycle/persistence behavior needs failure-path tests. Keep external provider/DNS mocks at the boundary; use real migrations/PGlite, actual worker math, and real training/replay fixtures where relevant. Current Python tests use unittest, not an assumed pytest/Vitest setup. Invoke fully qualified `research.lab` modules so test patches target the correct package.

Do not call a passing HTTP smoke test a browser rendering test, or mocked provider calls a live integration. Report what ran, what was blocked, and material limits.

## Claude Code and Codex compatibility

- `CLAUDE.md` is canonical; `AGENTS.md` links to it and is automatically read by Codex.
- `.claude/skills/<name>/SKILL.md` is canonical; `.agents/skills` links to it for Codex discovery. Claude: `/journey`; Codex: `$journey` (likewise other skills). Invocation arguments mean the user's supplied text in either client.
- `.claude/agents/*.md` contains shared reviewer instructions and Claude metadata. `.codex/agents/*.toml` registers those reviewers for Codex and points to the same Markdown body. Agents inherit the active model; Claude metadata is not Codex configuration.
- Translate client-specific read/search/shell/delegation tool names to available equivalents. Skills do not install missing MCP services or grant credentials/permissions.
- All instruction, skill, reviewer, and adapter files are version-controlled and must remain outside ignore rules. Do not copy another repository's personal settings, secrets, task history, or ignore policy.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
