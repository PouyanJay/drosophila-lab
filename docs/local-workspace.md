# Drosophila — local research workspace

This edition runs the website, measured MaleCNS atlas, database and trainer on your computer. It does not require a Sites account, Cloudflare, Supabase Cloud, or a public tunnel. It is a single-user workspace bound to localhost, not a multi-user Internet deployment.

## First launch

Install Node 22.13 or newer and Docker Desktop (or Docker Engine with Compose on Linux). Start Docker, allocate at least 8 GB of memory, and allow several GB of disk space. The first dependency and container installation needs Internet access.

From this repository:

```sh
npm run install:ci
npm run local
```

Open **http://localhost:3000**. You can also use the supplied Start script: it installs dependencies with the pinned pnpm version on first launch if needed. The launcher starts local Supabase, applies pending migrations without resetting data, generates secrets once, starts the trainer and verifies its pinned graph. It automatically connects the app to that trainer. No connection-file import is needed.

The launcher uses development mode for immediate startup. For an optimized local website, stop the website terminal after initial setup, then run `npm run build && npm start`. Next reads the generated local environment file. Containers keep running.

## Use the workspace

1. Choose Offline guide for a completely local workflow, or connect OpenAI/Claude in the model picker. Those provider APIs still require the Internet and send your conversation to the selected provider; no model weights for them are bundled.
2. Choose Local trainer to train internal connections, or This browser for readout-only training with WebGPU/CPU.
3. Describe the experiment, review the configuration, and start the comparison.
4. New experiment starts a separate conversation. Saved conversations opens searchable history, with rename, export, delete and reopen actions. Past runs shows training outputs.
5. Reopening a conversation restores its plan and selected result/job. Completed browser results retain trained readout weights, normalization, seeds, validation curves, held-out trials and graph provenance. Trainer runs retain their complete artifact files and resumable checkpoints.

## Architecture discovery

Use the branching icon in the conversation composer to search multiple structural variants instead of running one fixed comparison. The same worker supports cue memory, sequence recall, noisy decisions and registered custom task adapters. It uses the automatically connected local trainer; no separate compute setup is needed. Chat edits the validated brief, and inline controls start, pause, resume and review the search.

See [discovery.md](discovery.md) for the workflow, export/replay instructions and task adapter contract. Both successful and unsuccessful searches are saved. A completed search is not automatically evidence of an improved brain.

## Where data lives

| Data                                                                             | Local location                                |
| -------------------------------------------------------------------------------- | --------------------------------------------- |
| Conversations, discovery references, browser outputs, credentials, trainer queue | Local Supabase Postgres, private `lab` schema |
| Trainer tensors, checkpoints, logs and result artifacts                          | `.local-data/runs/`                           |
| Credential encryption key and local configuration                                | `.env.local`                                  |
| Unsent saves during a database outage                                            | Browser IndexedDB retry queue                 |
| Anatomy and pinned graph                                                         | Bundled repository assets                     |

The private schema is not exposed by Supabase REST and grants no access to anonymous or authenticated REST roles. The local Node server accesses it directly. This edition uses one local researcher identity and trusts your OS account; it does not use a shared hosted identity or offer public sign-in.

Supabase Studio is available at http://localhost:54323. Do not expose local database/container ports to the Internet. API credentials are encrypted before saving; keep `.env.local` with backups or those credentials cannot be decrypted.

An outage leaves pending saves in a browser retry queue, retried every ten seconds and on reconnect. Do not clear browser data while saves are pending. The queue is not a substitute for database backups. A browser run interrupted before completion must restart; only the persistent trainer supports checkpoint resume. Closing the website does not stop trainer jobs while Docker remains running.

## Stop and restart

Ctrl+C stops the website. `npm run local:stop` stops the trainer and Supabase while keeping their data. `npm run local` starts them again. Do not use `supabase db reset`, `supabase stop --no-backup`, or delete Docker volumes unless you intend to erase data.

## Backup

Close the website to prevent concurrent edits, then run `npm run local:backup`. The trainer stops at a safe checkpoint while the database and files are copied; it starts again afterward. Backups are kept in `backups/`, excluded from Git.

To restore onto a fresh installation: start the local stack once, then close the website. Run `npm run local:restore -- backups/FOLDER` with a trusted backup folder. Restore refuses to replace a nonempty workspace. It stops the trainer, restores the database transactionally, copies the artifacts and recovers the credential encryption key. Run `npm run local` afterward. Do not restore backups from an untrusted source.

Hosted history is not automatically migrated: this local database starts empty. Existing JSON exports can be imported through the validated records endpoint; no hosted credentials or user data are bundled.

## GitHub

Commit source, `pnpm-lock.yaml`, Supabase configuration and migrations. Do not commit `.env.local`, `.local-data`, backups or dependency folders; ignore rules cover these.

The original hosted build scripts and legacy SQLite migration files are historical compatibility material; the local commands use standard Next.js and the Supabase migrations in `supabase/migrations`. The local trainer uses Postgres; SQLite remains only as a standalone engine-test fallback. The atlas includes the original bundled sample of detailed neuron morphologies, not a downloaded skeleton for every neuron. Selecting an unbundled morphology reports its absence and does not use the Internet.

## Verification

`npm run build` checks production compilation and TypeScript. `npm run test:local` verifies record APIs, real Postgres SQL semantics using embedded Postgres, save/reopen persistence and the offline retry queue. `node tests/local/http-smoke.mjs` checks startup and request restrictions after building. With `npm run local` running, `node scripts/test-local-stack.mjs` performs a real, small full-graph training comparison and verifies its saved artifact checksum. See validation-local.md for what was actually run in this delivery.
