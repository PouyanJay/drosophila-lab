# Implementation

- [x] Inspect renderer, workspace, reference techniques and source data.
- [x] Add reproducible, bounded morphology display preparation and artifact checks.
- [x] Build shaded tube renderer, depth treatment, progressive loading and picking.
- [x] Integrate selection, framing and dark viewport in existing workspace.
- [x] Browser verification and screenshots; fix rendering/interaction regressions.
- [x] Relevant make checks and independent code/scientific reviews.

## Delivered first milestone

768 representative neurons, 1,305,364 simplified source branch segments, approximately 12 MB compressed geometry. Source radius estimates, SHA-256 provenance, stable body IDs and legacy buffers preserved. Rounded GPU-instanced branches, MSAA, depth-derived ambient occlusion, source picking/hover, smooth focus, isolate/context, thickness and shading controls. Existing chat, evidence, inventory, clipping and source-copy comparison remain. No discovery-service changes, paid inference, uploads, commits or pushes.

Baseline: 137 skeletons / 748,428 thin-line segments; SWC radii discarded by legacy display preparation. This is the first quality milestone, not full EveryNeuron feature/data-density parity. Authentic cell membrane meshes, broader morphology coverage and synapse/EM layers remain later work; official upstream sharded Draco mesh format researched and recorded in the design documentation.

## Verification

- `make lint`: 6/6 checks passed; removed three obsolete atlas React-ref suppressions, no increase in debt. Existing 19 warnings remain.
- `make test-web`: 36 Node tests passed, including manifest/geometry integrity tests.
- `uv run --frozen python -m unittest scripts.data.test_atlas_geometry`: six tests passed, including source transform/radii, stable selection, branch/radius/curve preservation, pure/branched/self cycles, all chunk hashes, bounds and identities.
- `make test-research`: existing research/browser checks passed.
- `make build`: production build passed.
- Optional `tests/browser/atlas-renderer.mjs` with local Playwright: actual WebGL verifies equal-radius and tapered end-on cap coverage, side picking, opaque surface occlusion, hidden-surface restoration, separate comparison viewports and disposal.
- Actual app in Chromium/Metal: 768 cells render with zero shader/page errors; source search, focus, isolate/context, inventory, depth toggle, CNS scope, keyboard cutaway, reset and 390px mobile width checked. Injected one failed chunk settles at 736 cells with partial-data status. Missing manifest shows legacy fallback; unavailable WebGL shows 2D source positions.
- Final short desktop sample: median frame interval 18.5 ms, p95 25.9 ms over 40 frames at 1440×920 with MSAA/AO. This is an automated local sample, not a universal performance guarantee or sustained training-load benchmark.
- Final desktop/isolation/mobile screenshots under `docs/design/atlas-quality-*.png`.

## Independent reviews and fixes

`atlas_data_review` independently matched all 768 source hashes and all 2,610,728 display endpoints/radii to original SWCs. Its branched-cycle validation finding was fixed with independent parent-chain validation and regression fixtures.

`atlas_web_review` covered browser lifecycle, style, picking, passes and accessibility. Fixed opaque-surface occlusion, axial/tapered cap coverage, isolation outside loaded sample, hover announcements and camera reset. Browser testing also exposed a missing slider-thumb label and a mobile status/dock overlap; both corrected.

Refreshed only the website process after detecting a stale development stylesheet; existing Docker services/trainer were reused by `make start`. Saved research data and source-hashed workers remain unchanged.

Final reviewer follow-up confirmed cap/picking/error fixes; soma and legacy-fiber isolation guards were then corrected explicitly and rechecked with TypeScript and scoped ESLint.
