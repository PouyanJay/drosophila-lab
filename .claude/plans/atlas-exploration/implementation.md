# Progress

- [x] Inspect the actual reference explorer in Chromium/Metal: class filtering, palette/by-group modes, outlines, named views.
- [x] Expand source metadata and representative coverage to 2,048 cells / 3,102,551 segments. Remove obsolete display chunks; preserve numerical sources.
- [x] Clear color modes, class filters, same-type sample focus, context brightness and depth contrast.
- [x] Named views, compartment wireframes, reduced-motion-aware orbit, accessible controls and attributed image export in the existing workspace.
- [x] Browser checks, screenshots, scientific/code review, lint, relevant tests and production build.

Details, commands and remaining parity gaps: `docs/design/atlas-exploration.md`.

Review corrections: align manifest chunk cap with generator; camera preset precedence; reset export handling; explicit disabled custom controls; fresh geometry selection catalog loading; clear both inspector and renderer selection on preset changes; invalidate stale pick requests when selection/navigation supersedes them.

Previous baseline committed as 8c5918c. No commit/push authorized for this iteration.
