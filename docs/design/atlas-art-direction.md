# Atlas art direction and source-surface close-ups

This pass responds to the user's four EveryNeuron screenshots, emphasizing material quality, color composition, quiet context and camera movement rather than adding another set of general controls. It extends [the exploration iteration](atlas-exploration.md).

## What changed

- The default overview uses a stable individual-cell palette with deeper blue/violet, balanced teal/mint and warm accents. Selection retains the cell's color instead of turning every selected neuron gold.
- Branch lighting uses a more directional key and lower fill for readable rounded profiles. Unselected neurons lose saturation as they recede into context.
- The background is dark graphite. A separate quiet-context treatment renders source neuropil compartments as neutral translucent shells, with low specular intensity and no clearcoat. It is not an outer-brain envelope or fabricated tissue.
- Camera moves use a 1.1-second smooth easing curve and interpolate around the subject, avoiding straight paths through the brain. Frame-rate-independent orbit timing, user interruption and reduced motion are handled. Front/side/top views preserve a selected neuron's framing.
- **Explore atlas → Surface close-ups** offers DNp01 (10001), MN6 (519667) and Dm3b (935186). These automatically isolate the chosen cell while retaining quiet anatomical context.

## Actual membrane geometry

The three close-ups use official MaleCNS segmentation meshes at **LOD 2**. They are not tubes derived from skeleton radii. The surface layer loads only for a selected gallery neuron; all other representative cells continue to use SWC radius estimates. Loading/failure/source-detail messages are explicit. A failed or corrupt surface leaves the skeleton usable. Picking the visible membrane retains its neuron identity.

The offline [CloudVolume decoder](https://github.com/seung-lab/cloud-volume/blob/master/cloudvolume/datasource/precomputed/mesh/multilod.py) reads the official sharded Draco data. `scripts/data/atlas_membranes.py` uses isolated `uv` script dependencies pinned to cloud-volume 12.14.4; it does not modify the trainer environment. Run:

```sh
uv run scripts/data/atlas_membranes.py
```

Coordinates convert nm to µm and rotate to `(x, -z, y)`. The manifest includes source metadata, its canonical JSON SHA-256, decoder version, body IDs, LOD, bounds, counts and packaged asset hashes. Three assets total approximately 5 MB compressed. Independent review found maximum membrane/SWC bound differences of 1.792, 0.896 and 0.832 µm respectively. Attribution remains in `public/malecns/ATTRIBUTION.txt`.

## Validation

- `make lint`, `make test-web` (40 tests), and `make build` passed. Existing lint allowance unchanged.
- Unit/artifact tests cover orbital distance, duration, interruption, immediate reduced-motion completion, membrane checksums, bounded decoding, truncation, indices, cancellation, published hashes and shared coordinate bounds.
- Real GPU fixture verifies membrane picking identity as well as existing tube geometry, filters, occlusion and comparison output.
- App browser checks verify gallery isolation, actual source-surface rendering, intermediate and final camera frames, reset after close-up, corrupt-surface fallback, subsequent selection and reduced-motion rendering.
- Independent web and scientific reviews ran; reset-flight cancellation and membrane picking regressions were fixed.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/browser/atlas-art-direction.mjs
```

The app test requires a running local app (`ATLAS_TEST_URL` can override localhost:3000), intercepts record reads and makes no paid calls. Visual evidence is saved under ignored `.validation/atlas-art-*.png`.

## Still incomplete

This is not full EveryNeuron parity. True surfaces are available for three curated cells, not the whole atlas. Full coverage requires progressive mesh streaming, memory budgets and level-of-detail selection. Annotated anatomical stories and broader region/type presentations are also still separate work. No neural activity, synapses, or improved engineered-brain anatomy are implied by these display changes.
