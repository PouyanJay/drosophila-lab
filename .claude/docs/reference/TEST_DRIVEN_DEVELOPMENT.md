# Test Driven Development

For bug fixes, reproduce the failing behavior before changing it. For new lifecycle or persistence behavior, cover a successful path and meaningful failure/retry/restart paths. Use real state transitions and assertions on stored rows/checkpoints, not merely status 200. External service mocks are appropriate; do not mock the implementation being proved. Run `make test` or the relevant narrower suite. Tests must isolate temp files, processes, ports, environment, and monkey patches. Report skipped/live-service tests separately.
