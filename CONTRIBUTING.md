# Contributing

## Setup and checks

Use Node 22.13 or newer. Install exactly the committed dependencies:

```sh
npm run install:ci
npm run check
npm run build
```

The installer runs the pnpm version pinned in `package.json`; a global pnpm or Corepack installation is unnecessary. Use `npx pnpm@11.25.0 add PACKAGE` when intentionally changing dependencies, and commit the resulting lockfile.

`check` runs formatting, route/type generation, lint, persistence tests, and the browser/research checks. Provider and trainer HTTP calls in those tests are mocked. Full-graph CPU checks take longer than the small unit tests.

For the Python numerical suites, use an isolated Python 3.11 environment:

```sh
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
npm run test:python
python -m ruff format --check scripts research/export_ancestry.py
```

On Windows, activate `.venv\Scripts\Activate.ps1`. Run Python tests through the provided command: discovery tests patch fully qualified `research.lab` modules, so importing the same package as `lab` changes the test's behavior.

Running the complete local application additionally requires Docker; see [Local workspace](docs/local-workspace.md). The optional `node scripts/test-local-stack.mjs` check creates a real training run in an already-running workspace.

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
