# Dark atlas: first visual milestone

Implemented inside the existing chat/atlas/evidence workspace. This is the first visual-quality milestone inspired by EveryNeuron; it does not claim feature or data-density parity with that site. The implementation and display pipeline are original and use upstream MaleCNS data.

[Desktop screenshot](atlas-quality-desktop.png) · [Isolated source neuron](atlas-quality-isolated.png) · [Mobile screenshot](atlas-quality-mobile.png)

## What changed

- **768 representative source neurons**, retaining the original 137-cell sample; **1,305,364 branch segments** in approximately **12 MB** of compressed, checksummed display data.
- GPU-instanced rounded branches with source SWC radius estimates, directional shading, depth-corrected surfaces, multisample antialiasing and optional ambient occlusion.
- Progressive loading in three concurrent chunk requests, explicit partial-data status, legacy skeleton fallback, and existing 2D fallback on devices without WebGL. Devices without float render-target support retain shaded geometry without the AO postprocessing path.
- Hover and click identify source neurons. Selection smoothly focuses the cell and dims context; **Isolate neuron** hides other source branches. Search provides a keyboard-accessible path to the same selection. Descending/ascending neuron search opens CNS context.
- **Display settings** includes depth shading and branch thickness. Existing region surfaces, inventory, clipping, camera views and comparison remain available. Reset now resets the camera even when the selected orientation has not changed.
- Shared slider thumbs now receive their accessible labels, so the new thickness control and existing cutaway/opacity controls can be addressed by name.

## Data meaning

The source dataset is MaleCNS v1.0, attributed to FlyEM/HHMI Janelia, University of Cambridge, MRC LMB and Google Research under CC BY 4.0. This is a representative anatomy sample, not every neuron in the computational graph.

Coordinates use the existing `(x, -z, y)` viewing transform, converted from 8 nm source voxels to micrometres. The versioned manifest records source hashes, generator/catalog hashes, bounds, IDs and output chunk hashes. Simplification only operates on degree-two chains, with 1 µm positional and 0.25 µm radius tolerances. Roots, branch points and chain endpoints remain source nodes.

The rounded surfaces represent **skeleton radius estimates**, not reconstructed membrane segmentation meshes. A 0.12 µm display-radius floor and user thickness scaling improve readability; stored coordinates/radii and computational graphs are unchanged. The shader uses a screen-facing cap approximation for end-on segments. No activity or performance result is inferred from the appearance.

## Modules

- `scripts/data/atlas_geometry.py`: deterministic representative selection, source fetch/cache, SWC validation, topology-preserving simplification, compressed artifact preparation.
- `atlas-morphology.ts`: manifest, integrity and decoded-geometry validation.
- `atlas-morphology-layer.ts`: bounded loading, source identity mapping, visibility and GPU selection including opaque-surface occlusion.
- `atlas-tubes.ts`: rounded-branch geometry and shading.
- `atlas-effects.ts`: depth-derived AO, antialiasing and display output.
- `atlas-view.tsx`: integration with existing cameras, source surfaces and interaction lifecycle.

## Reproduce and verify

```sh
uv run --frozen python scripts/data/atlas_geometry.py
uv run --frozen python -m unittest scripts.data.test_atlas_geometry
node --test tests/atlas-morphology.test.mjs
make lint
make test-web
make test-research
make build
```

Preparation downloads source SWCs into ignored `.local-data/atlas-swc`; it never rewrites legacy skeleton buffers or trainer artifacts. Atlas geometry checks also run under `make test-python` and `make test`.

The optional GPU regression fixture needs Playwright and its Chromium installation:

```sh
# If Playwright is already available to Node:
node tests/browser/atlas-renderer.mjs
# Otherwise, point to an existing installation's entry module:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser/atlas-renderer.mjs
```

It serves only allowlisted renderer/library assets on an ephemeral localhost port and verifies end-on/side selection, opaque-surface occlusion, hidden-surface restoration, separate comparison viewports and disposal with real WebGL. It does not launch campaigns or call providers.

## Verification and limits

Independent scientific review checked all 768 cached source hashes and all 2,610,728 emitted endpoints/radii against source SWCs. Browser checks cover rendering, selection/isolation, inventory, display switches, keyboard cutaway, reset, mobile width, partial downloads, missing-detail fallback and unavailable WebGL. Dedicated fixtures cover malformed/cyclic SWCs, simplification, artifact integrity and picker geometry.

This milestone does not add detailed membrane meshes, all 22,691 representative cells shown by the reference, synapse exploration, microscopy slices or model-activity playback. Those remain separate extensions after review of this visual foundation. Discovery-service implementation remains separate.

### Next visual-detail step

Authentic membrane surfaces are available from the official `v1.0/segmentation/multi-res-meshes` source, using sharded `neuroglancer_multilod_draco` with 16-bit quantization. They require a tested offline shard/LOD extractor, Draco decoding and coordinate validation before integration. The current tube dataset deliberately remains independent of that future extraction path.

Final local Chromium/Metal sample at 1440×920 with MSAA/AO: 18.5 ms median and 25.9 ms p95 frame intervals over 40 frames. This brief automated sample does not establish performance under sustained concurrent training or on other devices.
