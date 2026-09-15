---
name: makefile
description: Create or update this repository’s Makefile and local developer orchestration following the Lunaris thin-dispatcher convention.
---

# Makefile

Read `.claude/docs/reference/MAKEFILE.md` and current scripts. Keep `make help` the default, all command targets phony, and each recipe a single script invocation. Put tool bootstrap, command execution, ports, readiness, logging and cleanup in scripts, with shared utilities.

Use uv for Python and the pinned pnpm lock for web dependencies. `make run` must serialize setup then startup even under `make -j`, preserve secrets/data, discover occupied ports, start/reuse this project's Docker services, print actual URLs and log paths, and own only its tracked processes. Never kill arbitrary port occupants or prune Docker globally.

Test occupied ports, stale/matching/unrelated process identity, repeated starts, failure cleanup, lock ownership, and aggregated failures. Checks must report all selected suite failures. Disclose any unavoidable OS prerequisite or daemon failure with the exact next action.
