# Drosophila Research Studio

**Architecture discovery:** [DISCOVERY.md](DISCOVERY.md) explains the reusable structural search worker, three built-in tasks, custom adapters and versioned brain exports. See [VALIDATION-DISCOVERY.md](VALIDATION-DISCOVERY.md) for measured verification and remaining environment limitations.

**Local Supabase edition:** start with [LOCAL-WORKSPACE.md](LOCAL-WORKSPACE.md).
The app, database, atlas assets and trainer now run locally. No hosted deployment is required.
The hosted-service instructions below describe the earlier version.

A MaleCNS anatomical atlas and full-connectome architecture research workbench.

The main app opens as one research workspace: a persistent atlas, collapsible experiment conversation and an evidence drawer. It supports both persistent full-network training and executable whole-graph browser readout experiments. Three.js renders the actual segmented anatomy, with selection, source morphology search, isolation, hiding, cutaway, and an assembled-to-inventory slider. Inventory pieces are fitted to cells for inspection, not shown at relative anatomical scale.

The browser worker downloads and verifies approximately 53 MB of typed source arrays, retains the complete 165,122-neuron graph, and runs real training, validation, held-out evaluation, latency timing and recurrent-edge ablation. The browser engine trains a 55-parameter logistic decision readout on class mean and squared activity features; recurrent dynamics are fixed. It is not the differentiable Python engine. Source-derived copies inherit adjacency and body IDs; optional slow decay and count-threshold pruning are explicit model changes. In-progress browser computation stops when the tab closes.

The conversational guide supports selectable OpenAI and Claude models in the composer. The model menu verifies connections and retrieves each account's live supported model list. A user can add an existing API key through Connections; server routes authenticate the signed-in Site user and encrypt personal keys in D1 using AES-GCM with per-user/provider authenticated context. `PROVIDER_ENCRYPTION_KEY` is provisioned as a Sites secret and must be preserved: rotating it requires re-encrypting or reconnecting stored credentials. Keys never enter conversation records or browser storage. Optional `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` site-level secrets remain supported. OpenAI API-key creation, when requested, uses the OpenAI Developers plugin; the connection form accepts already-provisioned keys.

`/api/guide` calls OpenAI Responses or Anthropic Messages with the selected model, prior conversation, current plan, and measured evidence summary. Both providers return validated structured plans. Claude schemas omit unsupported numeric constraints, which are checked server-side with Zod. Provider errors never silently switch models or fall back to the offline guide. The explicit Offline guide remains available from the model menu. Replies retain their provider/model identity when switching. An explicit Run action starts training after plan review.

Evidence includes live learning curves, paired checkpoint decisions in a Three.js arena, a full test-trial matrix, seed variation, confidence intervals, and ablation. The arena's movement is schematic decision playback, not a learned embodied navigation policy. Results and conversation drafts are stored in D1, with export available on failure.

The earlier full-graph differentiable Python workbench is retained at `/archive`, and the bounded circuit workbench at `/circuits`. A permanent external GPU training or embodied simulation service is still **not attached**.

## Research engine

See [research/PROTOCOL.md](research/PROTOCOL.md) for the model, source filters, training/selection protocol, task limitations, hardware requirements and execution commands.

- 165,122 source Traced neurons, including unclassified and unpositioned neurons.
- 6,235,682 observed directed connections with ≥5 synapses; 89,731,552 observed synapses.
- Full sparse graph; no node subsampling for training.
- Trainable class-specific recurrent gains, time constants, bias, sensory encoder and readout.
- Source-neuron duplication with inherited adjacency and transmitter sign, explicit source-body ancestry, optional edge pruning.
- Optional GRU expansion with learned feedback. Ablation exposes whether gains depend on biological recurrence.
- Paired seeds; fixed independent train/validation/test streams; validation checkpoint/architecture selection; held-out evaluation; warmed latency measurement; saved checkpoints.

Individual synaptic weights remain normalized measured priors. Synthetic sequence tasks are software capability checks, not rich behavioral benchmarks. Cue recall has only two distinct noiseless inputs. This is not a living-fly emulator or a demonstrated generally superior neural architecture.

## Anatomical atlas

The source-based Three.js viewer renders 83 segmented region surfaces, 140,628 measured soma/root positions and a deterministic overview of 137 neuron skeletons. Search retrieves individual official SWC morphology. Linked views share the same geometry, with cutaway and compartment-separation controls. Anatomical axes are x, −z, y in micrometres. Display modifications do not imply new biological coordinates. Engineered duplicates highlight their source ancestors instead of inventing positions.

Atlas references: siibra explorer, FlyWire Codex and Allen Brain Atlas. All anatomy is MaleCNS source data; none of those other atlas datasets is substituted into this platform.

## Recorded exploratory experiments

`public/research/results.json` contains two actual CPU experiments with three seeds and 24 training updates per architecture:

1. Source-derived duplication: 64 descending neurons duplicated, with and without 30% pruning. Accuracy was unchanged at 69.3%; the pruned variant was about 1.32× faster on the measured CPU.
2. Optional GRU expansion: 16 added units reached 100% on simple cue recall versus 69.3% baseline. Performance survived biological-backbone ablation, so this does not demonstrate an advantage from fruit-fly wiring. Pruning plus expansion measured about 1.23× faster than baseline.

These small experiments do not establish statistical significance, broad generalization, or architecture superiority. Full configurations, per-seed curves, parameter changes, ablations and checkpoint hashes are recorded. The checkpoint archives and runner are downloadable from the UI.

## App structure

- `app/workbench.tsx`, `app/workbench.css`: full-network research studio.
- `app/atlas-view.tsx`: shared real-anatomy viewer and source-ancestry highlighting.
- `app/api/records`: validated D1 experiment/job/result persistence; preserves older graph/run records.
- `app/api/morphology`: official SWC lookup by numeric body ID.
- `/circuits`: earlier 192-neuron circuit workspace retained for existing work.
- `research/`: CPU/CUDA model, data preparation, evaluation, numerical tests and protocol.
- `scripts/data/`: reproducible atlas source extraction, morphology and mesh simplification.

## Validation

`python research/test_runner.py` checks sparse direction/gradients, source-copy adjacency inheritance, original-graph immutability and gradients through recurrent parameters. Recorded checkpoint replay is verified against saved accuracy. `node node_modules/typescript/bin/tsc --noEmit` checks the app. Use the Sites build script for deployment; this is a Vinext / Cloudflare Worker app with D1.

Data attribution: FlyEM (HHMI Janelia), University of Cambridge, MRC Laboratory of Molecular Biology and Google Research. MaleCNS data is licensed CC BY 4.0; source URLs and checksums are retained in `public/malecns/manifest.json` and `public/research/graph.json`.


## Browser experiment verification

`node scripts/research/check-browser-engine.mjs` validates the full retained node/edge counts, row normalization, sparse recurrence against an independent scalar calculation, source-copy ancestry, dataset separation, completed metrics and exact checkpoint prediction replay. `--study` runs a three-seed noisy-evidence comparison and saves a clearly labelled development-CPU example for inspection. These checks execute the actual engine, not mocked curves. They do not test physical-device WebGL rendering or AI-provider responses; no provider credential is configured.

`node --experimental-strip-types scripts/research/check-planner.mjs` checks the guided plan flow and result persistence validation. `scripts/research/export-browser.py` deterministically exports typed CSR arrays from the prepared full graph with per-part SHA-256 fingerprints.


## Model connection verification

`node scripts/research/check-providers.mjs` verifies encryption/context isolation, model-list filtering, both provider HTTP contracts, preserved conversation context, response validation and invalid-key handling. These provider-response checks use mocks; live model inference requires a real API key. The provider connection form verifies the key against its actual model-list endpoint before storing it. D1 migration 0001 adds a separate account-scoped encrypted credential table without changing existing records.

## Persistent reproducible lab (milestone 1)

The research conversation includes the persistent trainer, inline specification, run controls and saved-run navigation. Its evidence is rendered beneath the atlas in the same workspace. Full-network training is the default. It uses all retained MaleCNS nodes/edges and trains individual sign-preserving recurrent connection multipliers, class-level dynamics, sensory encoder and output readout. Source-copy candidates preserve ancestry. The optional browser readout check is under Compute → Advanced; it keeps internal connections fixed and trains the decision readout only.

Implementation plan and acceptance criteria: `docs/REPRODUCIBLE_LAB_PLAN.md`. Trainer and deployment instructions: `research/lab/SETUP.md`. Downloadable source, pinned dependencies and full graph: `public/research/persistent-trainer.zip` (generated by `scripts/research/package-lab.py --graph <prepared-graph>`).

The trainer owns a SQLite queue and persistent file volume; it supports idempotent submission, per-user isolation, pause/resume/cancel and restart recovery. Sites proxies requests using server-only `LAB_SERVICE_URL` and secret `LAB_SERVICE_TOKEN`. No trainer is automatically provisioned by deploying the website. Without a selected personal connection or legacy site values, the lab reports disconnected and disables submission. `LAB_ALLOW_LOCAL=1` is strictly for local development; omit in production.

Run `python -m research.lab.test_lab` for sparse gradient, source topology, deterministic resume/repeat/replay, API ownership and lifecycle tests. Run `python -m research.lab.verify_service --graph <prepared-graph> --out <verification-dir> --reference <uninterrupted-result.json>` for the real HTTP full-graph pause/restart/replay comparison. `node scripts/research/check-lab.mjs` checks the planning-to-job and Sites proxy contract; provider responses in that check are mocked.

The bundled `public/research/lab-example.json` is a real three-seed, 12-update full-graph measurement. Both architectures scored 58.33%; source-copy expansion did not improve accuracy. It is an exploratory synthetic pilot, not evidence of better general intelligence or biological fidelity. Example checkpoints live in the development verification output; the report explicitly distinguishes them from downloadable artifacts of runs on a connected trainer.

## Unified experiment conversation

The full validated `LabConfig` is shared by the agent, inline settings and submission; legacy browser `Plan` is not used to reconstruct persistent run settings. Both provider contracts include the exact draft and selected immutable job context. The host executes explicit action intents and reports actual acknowledgments. A revised draft cannot auto-start. Sessions retain the draft, engine and selected run in D1; job progress/results remain authoritative on the trainer.

`node scripts/research/check-conversation.mjs` verifies full configuration edits, action intent, provider context and session validation. Provider calls in this check are mocked. Live model inference and personal-machine training require the user’s connections.

## Self-service compute

The composer’s Compute menu manages private named trainer connections. `/api/compute` verifies public HTTPS/DNS, trainer credentials, engine identity and full graph before AES-GCM encrypted storage in `compute_connections`. The lab proxy accepts an owner-scoped `X-Compute-ID`; missing or foreign IDs never fall back to another machine. The selected machine is retained in the experiment session. Connection secrets never enter guide context.

The downloadable kit includes Docker launchers for macOS, Linux and Windows, an automatically generated persistent trainer secret, and a connection-file exporter. Personal setup uses a Cloudflare Quick Tunnel with no host port; the UI explains its testing-only availability and reimport after a tunnel restart. A permanent HTTPS endpoint is supported for stable deployments. The site remains private; no external incoming machine callback or site authentication bypass is needed.

Validation: `node scripts/research/check-compute.mjs` exercises a real SQLite database with the new migration, encrypted persistence, user isolation, SSRF guards, graph checks and selected-machine routing (DNS/trainer HTTP mocked). `python scripts/research/check-setup.py` checks stable secret generation, connection export and kit contents. Docker Desktop and Windows PowerShell execution require platform validation; neither runtime is available in the development workspace.

## Conversation-first experiment entry

The conversation panel centers its opening composer, with two descriptive experiment starters directly below it. Each starter sends a structured brief covering the task, change, matched comparison, evidence and review-before-start instruction. When a model is not configured, its menu opens and the brief continues after selection. The explicit offline workflow builds a complete reviewable plan from either starter; provider instructions also avoid asking users to repeat supplied decisions. Model and compute controls remain inside the composer. Past runs opens history separately from the new-experiment screen. Mobile follow-up suggestions scroll within their own row, keeping the reply box compact.

## Unified atlas workspace

Desktop keeps anatomy and conversation together, with collapsible measured evidence below the atlas. Phone navigation switches panels within the same mounted workspace, preserving the draft and selected run. Model and compute settings remain in the composer. Source structures and neuron search can prepare a contextual experiment prompt; inspection alone does not change the training population.

Original, Candidate and Compare share the same camera, display controls and source geometry. Blue markers identify the real source locations inherited by copies, not new biological neuron coordinates or activity. Draft previews and recorded runs are explicitly distinguished. The browser engine's pruning is reported as a configuration value; individual removed edges are not overlaid on the anatomical surface. No live activity trace is invented.

`public/research/atlas-variants.json` is generated by `python scripts/research/export-atlas-map.py`. It preserves the exact graph hash and each engine's separate source-ranking rule. `node scripts/research/check-atlas-variants.mjs` compares previews to both saved engine reports, checks every mapped coordinate against the source catalogue, and verifies replay input/decision alignment. The persistent lab's decision arena plays the recorded input sequence and checkpoint probability; its movement is a schematic illustration. Browser submissions preserve the reviewed seed.

Design reference: https://www.tasteskill.dev/docs. Pure-black anatomy canvas, graphite panels and cool-blue interaction accents, and source-specific anatomy colors. Layout and workflow QA covered desktop, compact desktop and phone sizes. The test browser used the 2D fallback because WebGL was unavailable; GPU rendering remains a hardware validation item.

The left conversation sidebar has a draggable, keyboard-accessible divider and remembers its width when collapsed. Collapse lives in its own panel; an edge button reopens it. Narrow screens retain full-width panel navigation. Brain framing responds to canvas dimensions while preserving orbit and relative zoom during resizing. Neuropil surfaces start at 0% opacity, with source fibers visible; entering Inventory or Isolate explicitly reveals surfaces for that inspection.

The workspace uses borderless chrome, a compact brand area and a centered floating comparison control. The canvas has no repeated heading. Scrollbars are 3px in WebKit/Blink and thin elsewhere, transparent until scroll activity, then hidden again after 800ms. The separator is quiet until hovered or keyboard-focused.

Conversation entry uses a centered composer with the improvement question as its placeholder. One responsive header groups the workspace identity, dataset information, history, new-experiment action and panel collapse; the separate welcome title and conversation-label row are removed. Header organization references https://atlassian.design/components/page-header/.

The collapsed desktop sidebar retains a 64px logo rail. Clicking its logo restores the previous conversation width and draft. Composer focus is indicated by one outer border; the textarea has no independent outline.
