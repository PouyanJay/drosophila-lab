# Initial structural refactor validation

Validated locally on 2026-09-15 using Node 25.9.0, the pinned pnpm 11.25.0, Python 3.11.15, and CPU PyTorch 2.5.1. The supported Node floor remains 22.13.0; the added CI workflow targets Node 22.

| Check                                     | Result                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen dependency installation            | Passed through the portable installer                                                                                                                       |
| Prettier                                  | Passed for all maintained web source/configuration/documentation                                                                                            |
| TypeScript and Next route generation      | Passed                                                                                                                                                      |
| ESLint                                    | Passed against the explicit baseline; 332 existing errors and 19 warnings remain tracked                                                                    |
| Node engine/data/persistence tests        | 9 passed                                                                                                                                                    |
| Research scripts                          | All 8 passed: planner, providers, conversation, lab proxy, compute connections, atlas ancestry, full browser engine, and prepared-worker reuse/CPU fallback |
| Python lab/discovery tests                | 14 passed                                                                                                                                                   |
| Python offline runner numerical tests     | 3 passed                                                                                                                                                    |
| Python utility syntax and Ruff formatting | Passed                                                                                                                                                      |
| Next production build                     | Passed for all 3 pages and 8 API routes                                                                                                                     |
| Built HTTP smoke check                    | All pages and emitted stylesheets returned 200; invalid Host/cross-origin requests returned 403; API validation returned 400 with `Cache-Control: no-store` |
| Import restrictions                       | Rejected representative UI-to-server, shared-to-UI, and server-to-UI imports                                                                                |
| Preservation checks                       | 61 upstream UI files, scientific worker/runner snapshots, public datasets/engines/archives, and vendor assets retain their original bytes                   |

The Postgres tests use PGlite with the actual Supabase migration and real SQL. Provider, DNS, and trainer responses are mocked in HTTP contract tests. Browser checks execute the real full-graph CPU engine. Python suites use numerical fixtures and real training/replay.

The smoke check exercises HTTP and asset delivery, not browser hydration or visual rendering. Docker service startup, live providers, GPU/WebGPU, backup/restore, and the newly added GitHub workflow were not run. See [Architecture](architecture.md) and [Contributing](../CONTRIBUTING.md) for the remaining decomposition and lint work.
