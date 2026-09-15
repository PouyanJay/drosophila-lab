# Repository architecture

The lab is a single local Next.js application with a Python training service and Supabase Postgres. Routes and public URLs are unchanged by the initial structural refactor.

## Directory map

| Directory             | Responsibility                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/app`             | Next.js pages, root layout/global styles, and HTTP route handlers                                                          |
| `src/features`        | Atlas, studio, connections, discovery, lab, circuits, and archive UI; feature styles and hooks stay beside their consumers |
| `src/components`      | Shared branding and upstream shadcn UI primitives                                                                          |
| `src/hooks`           | Reusable React browser subscriptions                                                                                       |
| `src/lib/contracts`   | Runtime schemas and browser-safe shared types                                                                              |
| `src/lib/planning`    | Experiment planning, suggestions, and conversation logic                                                                   |
| `src/lib/validation`  | Validation of saved sessions and scientific results                                                                        |
| `src/lib/client`      | Browser workers, outbox, submissions, and downloads                                                                        |
| `src/server`          | Local identity, pooled database access, credential encryption, provider calls, and compute connections                     |
| `research/lab`        | Python protocol, numerical models, training/discovery engines, durable service, and numerical tests                        |
| `research`            | Offline research runner, preparation, evaluation, and provenance                                                           |
| `supabase/migrations` | The authoritative local Postgres schema                                                                                    |
| `scripts`             | Local launch/backup/restore, installation, data preparation, and standalone validation commands                            |
| `tests`               | Node behavior tests and the shared TypeScript module loader for dependency-isolated tests                                  |
| `public`              | URL-addressed datasets, browser workers/engines, downloadable artifacts, and images                                        |
| `docs`                | Operational guides, design context, and historical validation reports                                                      |

Next.js explicitly supports a `src` directory and separate application folders; the feature grouping here follows the lab's responsibilities. See the [official project structure guide](https://nextjs.org/docs/app/getting-started/project-structure).

## Dependency boundaries

Routes compose feature UI or server services. Feature UI may use shared components, browser helpers, and shared contracts. Shared logic must not depend on UI or HTTP entrypoints. Server modules must not depend on feature UI or route handlers.

Every module under `src/server` imports `server-only`, so Next rejects accidental browser imports, including indirect imports. ESLint additionally prevents UI/shared code from importing server modules or routes. Provider types live in a browser-safe contract instead of a module that performs credentialed HTTP requests.

Database connections are pooled in `src/server/database.ts`. All queries use native Postgres `$1`, `$2`, etc. placeholders with separate value arrays. The former SQLite-shaped query adapter, unused Drizzle schema/migrations, D1 example, Vinext/Cloudflare build scaffold, and environment-specific installers were retired. Their prior versions remain in Git history. Supabase migrations and the optional trainer tunnel setup remain intact.

## Preservation and generated files

`.gitignore` excludes dependencies, build output, local environment/secrets, backups, database/run state, and Python caches. `pnpm-lock.yaml` remains committed and installation retains the dependency age/build-script policies.

Formatting covers maintained TypeScript, JavaScript tooling/tests, CSS, configuration, and prose. It intentionally excludes the upstream shadcn/vendor assets, scientific datasets, public engines and downloadable archives, research source snapshots, and recorded validation payloads. Some research workers hash their source as part of checkpoint identity. Changing or reformatting that source requires a dedicated protocol/provenance review and archive regeneration.

The root CSS remains global because existing screens share selectors; this refactor does not change selector scope or styling order. Feature-specific styles remain beside the feature code. Browser workers retain their original public URLs and byte contents.

## Initial refactor limits

This establishes enforceable boundaries and readable maintained web source; it does not certify every existing algorithm or component. The baseline records 332 existing lint errors (mostly explicit `any`, plus state-in-effect/ref access findings), with 19 existing warnings. New code receives the full rules. The studio, archive, and circuit screens still have orchestration that should be decomposed further using typed worker messages, persisted-session schemas, and lifecycle tests.

Historical validation reports describe the runs recorded at that time. They are not evidence that every external integration was exercised after this refactor. Automated checks mock provider/trainer HTTP; live GPU, WebGPU, Docker backup/restore, and paid-provider verification require those services or hardware.
