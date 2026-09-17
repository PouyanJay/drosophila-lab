# Atlas exploration, second visual iteration

Follow-up: [art direction and authentic membrane close-ups](atlas-art-direction.md) supersedes the default palette, camera motion and membrane-availability notes below.

The dark chat/atlas/evidence workspace remains the main interface. Open **Explore atlas** (the sliders icon at the top of the atlas), or **Display settings** in the camera toolbar.

## Available

- Four explicit color modes: source cell class, stable individual-cell palette, anatomical group, and single color. Class swatches form a labeled legend. Colors represent anatomy, not activity or measured task performance.
- Twelve class filters, including an explicit other/unclassified category. Filters affect representative SWC morphology; compartment surfaces and soma positions have separate controls.
- Source-cell selection by clicking geometry, including before Search has been opened. Selection can isolate one neuron or show the same type within the sample. Surrounding-cell brightness is adjustable.
- Brain, whole-system, nerve-cord and neck camera destinations. Existing front/side/top, cutaway and inventory views remain available.
- Rounded radius-estimate branches, ambient occlusion, depth contrast, adjustable branch display thickness, and compartment wireframes using source neuropil meshes.
- Slow orbit pauses on interaction and respects reduced motion. Toggle off/on to restart it.
- PNG export captures the current rendered atlas and includes source attribution, coloring and display settings. It does not capture chat or other workspace panels.

## Data and limits

The representative layer now contains **2,048 source neurons and 3,102,551 segments**, up from 768 neurons. Its 66 compressed chunks total 28,350,163 bytes; decoded segment coordinates occupy 99,281,632 bytes before GPU attributes and render targets. Larger coverage increases download and GPU cost. This is not the complete 165,122-neuron computational graph or the full EveryNeuron display sample.

The offline generator records official SWC hashes and source metadata. Class, side and neurotransmitter fields match the existing catalog. Geometry uses source radii estimates and degree-two simplification, with documented tolerances. No numerical trainer, checkpoint, graph or archived engine changed. Attribution remains in `public/malecns/ATTRIBUTION.txt`.

Depth contrast, thickness, compartment wireframes and selection highlighting are display treatments. These are not membrane surfaces, microscopy, synapses, or recorded neural activity. Individual-cell colors repeat; same-type filtering covers only loaded representative cells. Compartment outlines are triangulated neuropil wireframes, not an outer brain envelope.

A 40-frame Chromium/Metal sample on the development machine measured 40.6 ms median and 43.8 ms p95 per frame with the denser view. This is a limited local measurement, not a cross-device performance guarantee; streaming and level-of-detail remain important next steps.

## Reference and remaining work

The reference inspected was [EveryNeuron's explorer](https://everyneuron.com/explore.html), particularly its class controls, palette modes, outlines and vantage points. Our code and display geometry are independently implemented from the official source data.

Full visual parity is not established. Important remaining work: a much broader streamed sample with level-of-detail and device budgets; authentic membrane meshes decoded from official multi-resolution data; clean outer anatomical envelopes; and more sophisticated camera transitions and lighting. Synapse/connectivity views require their own source-backed data and interaction design.

## Validation

- `make lint`: passed, with the existing 19-warning allowance unchanged.
- `make test-web`: 37 tests passed, including manifest integrity, categorical color identity and unknown-class handling.
- `uv run --frozen python -m unittest scripts.data.test_atlas_geometry`: 6 tests passed, including all published chunk hashes/bounds and new metadata/catalog equality.
- `make build`: production compilation passed.
- Real Chromium/Metal GPU fixture: cap coverage, picking, class/type hiding and restoration, surface occlusion, comparison viewports and disposal.
- Running-app browser checks: fresh-page picking, isolation, same-type mode, color/class controls, named views, export/reset without duplicate downloads, and mobile overflow.
- Failure checks: one failed chunk leaves 2,016 cells and a partial-data message; a failed manifest uses legacy fallback; unavailable WebGL uses source-position fallback.
- Independent scientific/Python and web/style reviews. Fixed chunk-cap mismatch, stale camera presets/selection, reset-triggered downloads, disabled fallback controls and fresh-pick catalog loading.

Optional browser checks require Playwright and a running app for the second command:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/browser/atlas-renderer.mjs
ATLAS_TEST_URL=http://localhost:3000 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/browser/atlas-exploration.mjs
```

The app test intercepts record reads and makes no paid model calls. Screenshots go to ignored `.validation/`.
