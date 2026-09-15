# Reproducible experiment milestone

## Goal and completion boundary

Describe and review a supported experiment in the studio, submit it to a persistent trainer, close the browser, return to progress/results, and reproduce the comparison from its saved configuration and checkpoints. Production execution requires an operator-owned, continuously running training service. A temporary development process is not production infrastructure.

## Frozen first protocol

- Source: MaleCNS v1.0, all 165,122 Traced neurons, 6,235,682 directed edges with at least five observed synapses. Preserve source body IDs, counts, classes, signs and checksums. No random substitute or anatomical node subset.
- First task: balanced binary cue recall through a delay with independent distractor noise. Alternate supported task: hidden-direction integration of noisy cues. Deterministic, disjoint split seed domains; serialize actual inputs and labels.
- Two architectures: original retained topology and a candidate duplicating 32 central-brain intrinsic neurons selected deterministically by connectivity strength. Copies inherit observed adjacency. Record their source ancestry. Zero copies is a useful identical-architecture control.
- Dynamics: leaky tanh recurrence; positive synaptic scale multipliers preserve the source sign approximation. Train individual retained edge multipliers, class-level gains, leaks, biases, sensory encoder and readout. These are computational assumptions, not reconstructed physiological parameters.
- Identical training batches, optimizer, learning rate, update count and checkpoint-selection schedule for each paired seed. Evaluate initial checkpoints as well as trained ones. Select checkpoints on validation loss; test only after both architectures finish training.
- Pilot defaults: three paired seeds, 12 optimizer updates, batch 4, eight recurrent timesteps, 32/16/32 train/validation/test examples. Small synthetic pilot, not a general performance claim. User may raise the bounded budget.
- Evidence: all per-seed train/validation curves, test predictions, paired accuracy differences and exploratory bootstrap interval (minimum three seeds), warm median inference latency excluding rendering, architecture sizes, recurrent parameter change norms, and recurrent-edge ablation. A tie or regression is a valid outcome.

## Implementation tasks

1. Implement a CPU sparse autograd operation with gradients for both input state and edge values; numerically compare against dense reference and finite differences. Implement the trainable model with immutable topology and source ancestry.
2. Write a deterministic runner. Hash graph files, source code, canonical configuration and datasets. Persist model/optimizer state, minibatch generator state, progress, best checkpoint and completed model records atomically. Resume at the last committed update. Refuse changed code/data/config during resume.
3. Implement a durable SQLite job service with authenticated HTTP API, owner-scoped reads/writes, idempotent submission, bounded input validation, serial execution, pause/resume/cancel, restart recovery, resource timeout and artifact downloads. Store files on a persistent volume. Never execute arbitrary submitted code.
4. Connect Sites to the trainer through an authenticated server-only proxy. Keep the trainer URL and shared secret in server environment variables. Derive ownership from Sites identity, never browser JSON. Health response distinguishes disconnected, unavailable, busy and ready. No fallback to browser execution.
5. Extend the existing conversational setup with an explicit persistent-lab mode, supported protocol description and review panel. Map only supported choices; reject unsupported changes. Show job history, live progress, paired result metrics, train/validation curves, per-trial decisions and download/repeat controls. Preserve the atlas and browser experiment mode.
6. Package trainer dependencies, Docker deployment with persistent volume, setup guide, command-line replay and verification tools. Offer downloadable trainer source through the studio. Deployment configuration must explicitly say that an external persistent machine is still required when none is connected.

## API and state contracts

- GET /health: authenticated capabilities and graph identity.
- GET/POST /jobs: owner-filtered history and idempotent enqueue.
- GET /jobs/{id}: status, progress, immutable configuration, completed evidence and artifact metadata.
- POST /jobs/{id}/{pause,resume,cancel}: legal state transition only; pause/cancel acknowledged at an update boundary.
- GET /jobs/{id}/artifacts/{name}: allowlisted stored artifact, streamed; no arbitrary path access.
- States: queued -> running -> completed/failed; running -> pausing -> paused; queued/paused/running -> cancelled; paused/failed -> queued with valid checkpoint. Interrupted running jobs requeue on service restart. Only one executor owns a data directory.

## Acceptance tests

- Dense/sparse forward and gradients agree; source graph unchanged; copies inherit source edges.
- At least one real full-graph original/candidate comparison completes, with recurrent edge parameters measurably changed.
- Repeat produces identical prediction/learning metrics on the same pinned CPU environment; timing is excluded from equality.
- Forced interruption and restart produce the same final trained state as uninterrupted execution.
- Saved checkpoints replay the reported held-out predictions; tampered source/config/checkpoints are rejected.
- HTTP submission, refresh/reconnect, progress, results, artifacts, pause/resume/cancel, duplicate submission and owner isolation are exercised. Secrets absent from responses.
- TypeScript/build checks and browser checks on desktop and narrow screen. No fabricated job status, metrics, or connected-service claims.
- Publish the updated studio. Report infrastructure activation separately from validated software.

## Deferred

Embodied physics, arbitrary task/code generation, autonomous architecture search, multiple concurrent GPU workers, spiking models, biological validation and general intelligence claims remain outside this milestone.
