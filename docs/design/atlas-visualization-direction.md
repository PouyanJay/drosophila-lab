# Atlas direction: EveryNeuron reference

Status: researched design direction, 17 September 2026; no production renderer changes.

The user identified [EveryNeuron](https://everyneuron.com/) and its [exploration experience](https://everyneuron.com/#explore) as the desired visual-quality reference. Preserve the lab's existing chat/atlas/evidence layout while improving the atlas content and interactions.

## What was verified

The site's delivered credits identify an independent project by Federico Guardabrazo, using public MaleCNS v1.0 data through neuPrint/navis, a Python preparation pipeline, and Three.js in the browser. Credits distinguish this project from Google/HHMI affiliation. They identify upstream data as CC-BY 4.0; that does not establish a reuse license for the website's own code or design assets.

Read-only inspection of its public JavaScript and [data manifest](https://everyneuron.com/data/index.json) found:

- Skeleton-based tube rendering using instanced camera-facing geometry and custom shaders for rounded appearance, normals, lighting and optional depth correction.
- Reduced-detail segmentation meshes, Draco decoding, compact typed-array skeleton data, gzip decompression, and progressive loading of anatomical groups.
- Ground-truth ambient occlusion (GTAO), denoising and temporal accumulation support, plus adjustable lighting and palette.
- An offscreen ID rendering pass for neuron picking; hover, isolation, fading and ghosted context.
- Camera choreography, clipping, synapse positions, and a registered electron-microscopy slice/segmentation stack in the story assets.
- The overview manifest contains 22,691 representative neurons covering 11,751 types, about 4.38 million tube segments (~30 MB declared compressed assets), and an alternative mesh overview with ~22.45 million faces (~76 MB declared assets). These are manifest counts, not measured transfer totals, runtime memory, or all neurons at full detail.

Evidence: [story bundle](https://everyneuron.com/assets/story-D9D_DNe2.js), [renderer/explorer bundle](https://everyneuron.com/assets/explorer-CfRt7pE4.js), and manifest version `5fb3952f8c39`. Bundle URLs are deployment-specific. The static poster was visually inspected. A headless browser reached the loading story but became unresponsive during dense rendering; complete interactive behavior and frame rate were not verified. No performance claim about the user's browser follows from this headless result.

## Our starting point

`src/features/atlas/atlas-view.tsx` already uses Three.js/WebGL, orbit controls, lighting, region meshes, soma points, clipping, anatomical inventory/explosion, comparison support, and selected-neuron morphology fetching. The bundled `public/malecns/skeletons.json` contains 137 skeletons; these render with `LineSegments`/`LineBasicMaterial`. Region surface meshes are not equivalent to individual neuron segmentation meshes. Adding shading alone will not supply the missing morphology density.

## Proposed delivery

1. **Representative quality slice.** Build an original implementation with radius-aware tubes and a small set of real cell meshes. Tune lighting, occlusion, color and selection inside the existing atlas. Compare fixed camera captures and measured performance before scaling data volume.
2. **Data and rendering scale.** Versioned manifests, neuron/body IDs, units/transforms, source attribution, representative sampling rules, compressed chunks, progressive loading, cancellation, bounded decoded/GPU caches and on-demand high detail. Offer adaptive quality settings; benchmark orbit/selection and simultaneous trainer workloads. Target 60 fps on the primary desktop where feasible, with a usable 30 fps fallback; these are targets, not measured results.
3. **Scientific exploration.** Whole brain to region to cell navigation; precise hover/picking; isolate a neuron/type/circuit with ghosted context; upstream/downstream neighbors and synapses where source data exists; clipping and registered EM context; saved camera views and exportable figures. Preserve keyboard paths, reduced motion and loading/error states.
4. **Discovery integration.** Original/Candidate/Compare share camera and selection. Show added/removed/rewired connections with provenance; selecting an agent experiment focuses its affected circuit. Add replay of recorded computational activations, separate from structural views and illustrative animations. Follow-agent camera motion is optional and interruptible.
5. **Invented and composite architectures.** Imported biology keeps its measured morphology. New modules and synthetic connections use an explicitly engineered schematic layer, linked to source ancestry. A weight/topology mutation does not create measured biological geometry. Multi-brain layouts expose modules and bridges without pretending to possess anatomical coordinates.

## Boundaries and acceptance

- Rebuild from upstream data with proper attribution; establish any required code/asset permissions before reusing site assets. This research did not copy its implementation into the app.
- Morphology rendering is distinct from computational topology and model activity. Record which neurons are shown, omitted, simplified or synthetic.
- Source body IDs and package ancestry must connect UI selection to evaluated artifacts. Do not imply that an attractive animation demonstrates improved performance.
- Verify pick identity, spatial transforms, comparison alignment, cache cleanup, memory limits, progressive-load cancellation and recovery, and measured frame times on the target hardware.
- The $70 discovery planning envelope covers the proposed research campaigns. New data hosting, acquisition or infrastructure costs require separate estimates; no additional spending was undertaken here.

This complements the [agentic discovery plan](../agentic-discovery-plan.md). It is a substantial atlas/data workstream, not a cosmetic CSS change or a replacement dashboard.
