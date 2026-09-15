# Makefile convention

Adapted from Lunaris's `.claude/plans/makefile-generation-generic-build-plan.md` and Makefile. The key decisions are a thin dispatcher, scripts owning logic, idempotent operations, shared readable progress, bounded readiness, failure aggregation, and a final summary.

Use `SHELL := /bin/bash`, `.DEFAULT_GOAL := help`, phony targets, and one script call per recipe. Serialize dependent operations in the dispatcher; independent Make prerequisites would race under `-j`. Tests and linters run every selected suite and aggregate status. Honor `NO_COLOR` and non-TTY output. Do not hide an error behind a spinner or an ignored exit code.

Keep `.env.local` private and preserve generated keys. Derived runtime config, state, logs and installed tools live under `.local-data`; committed Supabase config is the template. Reserve/check ports before starting services, verify health/identity, and stop only verified owned processes. No database reset, volume deletion, global prune, or arbitrary port killing. Document automatic alternatives for busy ports and hard failures that require administrator action.
