# Local workspace

The lab runs Next.js, local Supabase Postgres, and a durable CPU PyTorch trainer. Provider APIs are optional; Offline guide needs no provider key. Local execution does not imply an Internet deployment is supported.

## One command

```sh
make run
```

The dispatcher serializes dependency setup and startup even under `make -j`. It checks Node >=22.13, installs a checksum-verified project-local Node if needed, bootstraps uv if missing, runs the pinned pnpm frozen install, and synchronizes Python 3.11 from `uv.lock`. It starts or reuses Docker, allocates ports, generates runtime Supabase configuration, applies pending migrations, preserves or creates encryption/trainer keys, builds the trainer with uv, verifies its pinned graph, and starts the website. It returns after readiness and prints the actual URLs.

The website runs in development mode for hot reload, in the background with output in `.local-data/logs/web.log`. Startup installs/downloads dependencies and images on the first run; allow several GB of disk space and at least 8 GB for Docker. Public container images use a project-local Docker client configuration without credential helpers; the active Docker context is preserved and global settings are untouched. Local image builds omit timestamped [Docker build attestations](https://docs.docker.com/build/metadata/attestations/) so unchanged images do not restart the trainer on each launch. Scientific source/checkpoint hashes remain intact. There is no silent fallback to a fake trainer or an in-memory database.

## Host prerequisites

On macOS, have Bash, Make and curl available (normally through the developer tools). The launcher can install Docker Desktop through an existing Homebrew installation if Docker is absent, and opens Docker Desktop if its daemon is stopped. A first Docker Desktop launch may need its own privileged-helper/OS approval; the launcher waits for readiness and reports failure if that cannot complete unattended.

On Linux, provide Make, Bash, curl, tar, and Docker Engine with Compose. The launcher attempts to start an installed user/system Docker service without prompting for a password; install/authorize the daemon through the operating system if necessary. It does not change Docker socket permissions or run a remote root installer. On Windows use WSL2 with Docker Desktop integration and run Make there. The macOS/Linux Start scripts and `npm run local` call the same launcher; the Windows launcher requires Bash/WSL.

## Ports and coexistence

Defaults: website 3000, trainer 8000, Supabase block 54320–54329. Both active connections and bind availability are checked, including Docker Desktop forwarding. Busy defaults move to a free port/block without killing anything. To require particular ports:

```sh
make run WEB_PORT=3100 TRAINER_PORT=8100 SUPABASE_PORT_BASE=55420
```

An explicit occupied port fails with a useful message. Existing healthy Supabase is reused with its actual ports; stop the lab before changing its port block. Website and trainer bind to 127.0.0.1. Supabase's pinned CLI manages its own published bindings; use this as a local development environment, not a public host.

Derived Supabase configuration/migrations and process records live in `.local-data/runtime`; the committed `supabase/config.toml` remains the template. Keys live in `.env.local` (mode 0600), stay stable across restarts, and are never printed by the launcher's Supabase status handling. Do not delete this file while retaining encrypted credentials.

## Operations

Make commands share a Drosophila Lab heading, numbered progress steps, and timed completion summaries. Help groups commands by workflow. Checks show every suite result and a pass/fail total. Colors are enabled on supported terminals; use `NO_COLOR=1 make run` for plain output. Redirected output stays free of ANSI colors, and command diagnostics remain visible.

| Command                              | Behavior                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `make setup`                         | Synchronize locked web and Python dependencies                             |
| `make start`                         | Start/reuse the stack; set up dependencies if missing                      |
| `make run`                           | Full dependency synchronization, then start/reuse                          |
| `make status`                        | Website health, service state, and log location                            |
| `make check-ports`                   | Inspect preferred ports without stopping services                          |
| `make logs`                          | Follow website logs                                                        |
| `make stop`                          | Stop the verified owned website, trainer and project Supabase; retain data |
| `make backup`                        | Stop website and save private schema, artifacts and encryption key         |
| `make restore BACKUP=backups/FOLDER` | Restore a trusted backup into an empty running workspace                   |
| `make check`                         | Aggregate lint, tests, agent checks and production build                   |

Trainer logs: `docker compose --env-file .env.local -f compose.local.yaml logs --tail 100 trainer`. Treat logs as private. `make stop` never prunes Docker, deletes volumes, or stops a process merely because it occupies a port. A PID must match the recorded start/command identity and this checkout before it can be stopped. The lifecycle lock prevents concurrent start/stop operations and recovers locks left by dead processes.

A failed startup may leave this project's database/trainer running so data is retained; fix the reported cause and rerun, or use `make stop`. Inspect website logs when readiness fails. Never use `supabase db reset` as a startup repair. If a process record points to a different live PID, the launcher refuses to kill it; inspect the state and process before removing only the stale runtime record.

## Persistence and verification

Browser experiment computation stops with its tab. Persistent trainer jobs and checkpoints survive website restarts. Closing the invoking terminal after `make run` returns leaves the stack running; stop it explicitly when finished.

`make test` aggregates Node/PGlite, full browser CPU and Python numerical suites. HTTP contract checks mock external providers/trainers; this does not verify paid inference or GPU/WebGPU. The optional `node scripts/test-local-stack.mjs` creates a real small full-graph run in an already-running stack (the default URL is port 3000; set `LAB_TEST_ORIGIN=http://localhost:PORT` when using another port).

Backups include encryption keys and must remain private. Restore refuses nonempty data; it never silently overwrites an existing workspace. Historical standalone trainer setup and immutable downloadable artifacts remain under `research/lab` and `public/research`.
