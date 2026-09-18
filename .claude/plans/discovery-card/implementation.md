# Completed

- Task dropdown removed; the three existing composer suggestions are the task choices and expose selected state.
- Card shows task name, candidates, time limit and gain target. Full method, limits and validated JSON remain under Settings & method.
- Saved runs use an inline bounded list with selection state and timestamps; no overlapping native dropdown. Empty and failed states retained.
- Completed runs show concise status/evidence without stale phase or time-budget bar; active runs preserve progress and lifecycle actions.
- Browser fixture verifies task choice, saved-run selection, running/completed states, no campaign writes, and mobile bounds. Inspected dark/light/mobile screenshots. Lint and production build passed.
- Independent review caught indistinguishable same-day rows; timestamps restored and full IDs available on hover. No backend/scientific changes. Uncommitted.
