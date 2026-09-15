# MaleCNS architecture research runner

This code trains a differentiable recurrent model whose biological adjacency comes from the public MaleCNS v1.0 connectome. It is a research scaffold, not an emulation of a living fly.

## Execute

Use Python 3.11 or newer. Install `requirements.txt`, then run:

```
python runner.py job.json --out runs/my-experiment
```

The first invocation downloads official annotations, neurotransmitter predictions and a roughly 1 GB flat connectome. It creates a sparse graph in `data/full`. You can reuse an existing graph with `--graph /path/to/full`. CPU is tested. The CUDA path is implemented but untested in this workspace; it needs a CUDA-enabled PyTorch installation. No cloud training service is bundled or attached. Checkpoint files stay on the execution machine.

Results: `result.json`, per-model/per-seed `.pt` checkpoints, and an intermediate `progress.json`. Console JSON events report progress. Import `result.json` into the studio. A stopped job currently restarts training; resumable scheduling is not implemented.

```
python evaluate.py runs/my-experiment/model-1-seed-11.pt --graph data/full --out replay.json
```

Evaluation uses `weights_only=True` and reconstructs the model from the trusted local source. Keep the checkpoint's original `model-N-seed-S.pt` name because it encodes the seed for replay. Never interpret a downloaded checkpoint as Python code.

## Data and biological identity

All 165,122 neurons marked **Traced** in the v1.0 annotation table are retained, including unclassified neurons and neurons without coordinates. Directed edges between these neurons require at least five observed synapses, yielding 6,235,682 edges and 89,731,552 observed synapses. The published reconstruction has 166,700 neurons; our explicit status filter explains the different count. The graph is not a 192-neuron extract. Isolated retained neurons are not dropped.

`prepare.py` records source URLs, SHA-256 fingerprints, graph fingerprint, class counts and class connectivity. Files come from the official `flyem-male-cns` Google Cloud Storage bucket. Dataset: CC BY 4.0. Attribution: FlyEM / HHMI Janelia, University of Cambridge, MRC Laboratory of Molecular Biology, Google Research. Reference: https://male-cns.janelia.org/download/

## Dynamics and trainable parameters

The biological state update is a leaky tanh recurrence. Incoming absolute connection strengths are normalized to sum to 0.95 before class-specific gain. Consensus GABA is assigned a negative sign; every other or unknown transmitter is assigned a positive sign. This is an approximation; synapse counts do not directly measure physiological efficacy, and glutamate, receptor effects and neuromodulation are not modeled.

Backpropagation through the whole recurrent trajectory updates class-specific gains, leaks/time constants, biases, sensory encoding and a linear readout. Input reaches classes whose annotation contains `sensory`. Readout pools states by class. The measured sparse weights are fixed priors, not independently optimized synaptic weights. CPU uses a custom differentiable SciPy sparse multiplication, checked against dense forward and gradient calculations.

Architecture operations:

- **Source-neuron duplication:** select strongest incoming-plus-outgoing neurons in an annotated population, after pruning. New computational units inherit each selected neuron's input/output adjacency and transmitter sign. The original biological adjacency block is unchanged before normalization. Copies receive unique computational indices, with original body IDs recorded as ancestry. Copied edges are engineered; they are not new biological observations. No anatomical coordinates are invented.
- **Pruning:** remove an exact fraction of lowest-count directed edges, with stable CSR index tie-breaking. Keep every biological neuron. Renormalize incoming strengths after pruning/expansion.
- **Optional gated recurrent module:** learned GRU units receive class-pooled activity and send trainable feedback to biological neurons. There is no direct stimulus-to-GRU or GRU-to-readout connection, but pooled sensory activity can still let the module bypass the usefulness of biological recurrent wiring. Ablation tests explicitly expose that.

The default UI favors source-derived population expansion. The optional GRU is a hybrid computational extension, not claimed to be fruit-fly tissue.

## Experiment design

Supported synthetic tasks: cue followed by delayed recall; XOR of two temporally separated cues; majority/evidence integration. Time steps are abstract and not calibrated biological milliseconds. Training, validation and test streams use independent fixed seed ranges. Seeds are unique integers 0–9999. These task families are very small, particularly cue recall, which has only two distinct noiseless inputs per sequence length; their tests are software capability checks, not rich generalization benchmarks.

All architectures use the same initial shared parameters, data, update count, optimizer, learning rate and gradient clipping. The original-topology baseline also trains its recurrent dynamics, not merely a readout. Expanded models can have more parameters and use more compute, so matched updates are not equal wall-clock or parameter budgets.

Validation loss selects checkpoints and the architecture. Test data is evaluated after that selection. Results for other candidates are descriptive; do not use them to continue searching against the same test split and then claim an untouched test. To assess a final search winner, reserve another unseen benchmark or seed set.

Latency: seven warmed, batch-one, complete-sequence forward passes, median per seed, then mean across seeds. CPU time uses `perf_counter`; CUDA synchronizes. It excludes download/graph preparation/training. It is not biological speed and is sensitive to machine load. Topology preparation time is not in reported training time.

Uncertainty: paired-seed percentile bootstrap, only produced for three or more seeds. Three seeds are inadequate for strong significance claims. Accuracy deltas are percentage points, not relative percentages. Additional seeds, harder tasks and compute-matched controls are required for research conclusions.

Backbone ablation sets the measured sparse recurrence contribution to zero at inference while preserving intrinsic state, input encoding and any engineered module. If performance survives, improvement does not establish utility of the fruit-fly wiring. This control does not cover every possible shortcut or replace randomized-topology and matched-parameter controls.

## Recorded runs

The bundle includes actual CPU measurements, checkpoints and the exact v3.0 source for the first experiment. The second experiment uses v3.1 and source-neuron duplication. No fabricated learning curves or simulated progress are used. These are short exploratory runs, not evidence that we have engineered a generally superior brain architecture.

## Scope still requiring research/infrastructure

Independent trainable synapses, individual-neuron dynamics, spiking neuron calibration, embodied fly tasks, navigation/game/robotics adapters, larger benchmark suites, multi-GPU execution, resumable scheduling and a permanently attached training service are not implemented. The hosted app is the atlas, architecture specification editor and experiment/result registry; Python executes full-graph learning. Do not interpret the presence of atlas anatomy as physiological validation.
