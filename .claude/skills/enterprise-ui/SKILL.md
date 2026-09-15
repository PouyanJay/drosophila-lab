---
name: enterprise-ui
description: Build or review the lab interface for coherent research workflows, accessibility, and complete data states.
---

# Enterprise Ui

Adapt Lunaris's instrument-like panel/reuse principles to the lab's existing dark atlas/workspace, not its amber palette. Read `src/app/globals.css`, the target feature's CSS and shared primitives first. Preserve established color semantics for biological groups and run comparisons. Use existing semantic tokens and components; add tokens where repeated values need a shared role.

Design loading, empty, partial, error/retry, disconnected, running/paused/completed, and saved/unsaved states as relevant. Make keyboard paths, focus restoration/traps, icon labels, reduced motion and readable contrast explicit. Keep scientific claims tied to measured results and explain illustrative playback.

Verify the real user action and persisted effect. Use a browser/screenshot when available for interactive or layout work; record when only static/build checks were possible. Preserve CSS import order during moves. Avoid introducing a new component library or global restyling unless requested.
