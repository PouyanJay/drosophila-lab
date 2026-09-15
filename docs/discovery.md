# Architecture discovery

Discovery is a reusable local research worker. A task adapter defines what the network receives and how it is scored. The same worker proposes structural changes, trains paired models, ranks candidates, and tests one finalist. It does not guarantee that an improved variant exists within a campaign's search space or budget.

## Use it

1. Start the local workspace with `npm run local`.
2. In the conversation composer, select the branching icon labeled **Architecture discovery mode**. The discovery worker uses your automatically connected local Python trainer. Browser/WebGPU comparisons remain available in regular experiment mode; they do not execute this structural search.
3. Pick a starting task or describe the objective to your connected OpenAI/Claude model. The model edits a validated draft and asks for missing requirements. You can discuss the selected campaign's actual outcome afterward. Offline guide uses the same local worker, but configuration changes use the task selector or settings editor.
4. Review the task, scenario distribution, improvement threshold, slowdown allowance, and budget. Click **Start discovery** once. Retries reuse a submission key to prevent duplicate jobs.
5. Watch candidate history and train/validation loss in **Discovery evidence**. Pause, resume or cancel in the conversation. Training continues after the browser closes while the local service runs.
6. Reopen the conversation or use **Saved discoveries** to recover campaigns. Inspect the candidate's source locations in the atlas and download its bundle. An export is explicitly marked experimental unless it passed confirmation.

The default objective permits up to **3× slower** decisions in pursuit of **5 percentage points higher accuracy**. It tries up to eight candidates, adds no more than sixteen neurons, and has a one-hour active compute budget. These are starting limits, not a prediction of success. Task difficulty is fixed before the campaign; the worker cannot secretly choose an easier scoring distribution.

## Included tasks

| Adapter           | Question                                                                   | Scenario controls                                |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| `cue-memory`      | Which of four directions appeared before the delay?                        | Delay and distraction amplitude                  |
| `sequence-recall` | After an ordered sequence and delay, what was its first or last direction? | Sequence length, delay and distraction amplitude |
| `noisy-evidence`  | Which direction is supported by noisy evidence over time?                  | Observation duration and noise amplitude         |

Delays are simulation steps, not biological seconds. Each campaign can cover up to twelve scenarios. Scores average scenarios equally so an easy, frequent scenario does not silently outweigh the difficult ones.

## What changes in the brain model

Every candidate starts from the pinned retained MaleCNS connectivity: 165,122 neurons and 6,235,682 directed connections in the bundled graph. This is not a replacement dense ANN.

- **Duplicate and diverge:** add neurons inheriting actual incoming/outgoing adjacency from source neurons, with deterministic variations in copied connection strengths.
- **Recurrent loop:** use the same inherited adjacency and add self-recurrent connections to the copies.
- **Rewire:** redirect selected existing incoming edges toward the sensory population, preserving their count weights. Every edit is recorded.

Proposals use the selected source population and a fixed set of up to 128 strongly connected source neurons. The worker sometimes explores from the original rather than always extending its current best. Programs have bounded depth and a total added-neuron cap. This is a small, inspectable search space, not unrestricted brain synthesis.

Original and candidate train their recurrent connection scales, encoders, biases, gains, leak parameters and readout. Both get per-neuron bias/leak parameters. Their readout has identical width: class means plus fixed source-neuron probes. Descendants share their parent's probe through mean pooling, preventing an unfair increase in head size and reducing the dilution of a few copies into a huge class average.

“Original” means the original connectivity under these same engineered dynamics and training rules. It is not a measured living fly and is not directly comparable to the older readout-only browser benchmark. The atlas shows real source anatomy and source markers for inherited copies. It does not invent biological morphology for new neurons or present those markers as measured anatomy.

## Search and evidence protocol

1. Train the original pilot and paired-seed baseline.
2. Propose a deterministic candidate, first evaluate a small pilot, then promote promising validation-loss candidates to full training across the same seeds and data.
3. Select checkpoints by validation loss and rank architectures by validation score, breaking ties by loss. Preserve candidate ancestry, topology hashes and training history.
4. Stop searching after a validation target, candidate budget, active time budget or stagnation limit. Time checks occur between work units, so a single operation or export can finish slightly beyond the limit.
5. Freeze one finalist. If it has positive validation gain, retrain it and the original using fresh confirmation training/validation data and fresh seeds. Only then read the held-out test split. The worker never returns to search after seeing that test.
6. Declare improvement only when mean test gain reaches the configured threshold, the lower bound of a paired-seed 95% t interval is above zero, and warmed decision latency stays within the slowdown limit.

Three to five seeds are exploratory evidence, not a universal guarantee. Repeatedly using prior test outcomes to redesign campaigns also becomes exploratory research; publication-quality claims need independent replication and fresh external evaluation. A more complex task can reveal useful limitations, but an impossible or uninformative task will not necessarily make architecture search productive.

## Persistence, versions and export

The queue and immutable configurations live in local Supabase Postgres. Each run's files live under `.local-data/runs/<campaign-id>/`. This reuses the local workspace's backup/restore path. Source graph files are never overwritten.

A campaign can end with no improvement, including no promoted candidate. Completed campaigns still retain their evidence. Where a finalist exists, its bundle contains:

- modified CSR graph, neuron IDs/classes/signs, ancestry and explicit edit history;
- selected original and candidate checkpoints, trained parameters and validation curves;
- task/scenario settings, seeds, source/code/checkpoint hashes and environment identity;
- recorded training and validation datasets, plus held-out arrays and decisions when confirmation completed;
- model card, experimental/confirmed status, variant version ID and checksummed manifest;
- matching worker source for reconstruction and replay.

No public upload happens automatically. Different campaigns produce separate saved variants with their task and lineage. New campaigns currently search from the pinned source, with internal candidate ancestry; importing a previous exported variant as a new campaign's root is not implemented.

### Verify an export

Unzip the bundle to its own directory. Use this repository revision and the recorded PyTorch/NumPy versions. The bundled `source/` files can be copied into `research/lab/` of a separate checkout to restore that worker revision. Keep an installed custom task adapter with its original source.

```sh
python -m research.lab.replay_discovery --graph PATH_TO_SOURCE_GRAPH --run PATH_TO_UNZIPPED_BUNDLE
```

The verifier checks hashes, graph identity and worker source before loading tensors. It reproduces recorded decisions from the exact held-out arrays when available. An unconfirmed export reports that test replay is unavailable instead of implying success. Timing itself is hardware dependent and is not expected to reproduce exactly. Manifests detect changes against their recorded hashes; they are not third-party digital signatures.

## Add another research task

Implement and register a `Task` in `research/lab/discovery_tasks.py`. Keeping its implementation in that versioned source file includes it in the worker hash and exported source. Restart the local trainer after changing source. Existing campaigns refuse resume with different source code; keep the old revision to resume/replay them.

| Hook                      | Contract                                                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                  | Stable `id`, `version`, name and `metric_name`                                                                                                                             |
| I/O                       | `input_channels` and `classes` (output width), each 1–128                                                                                                                  |
| `validate_parameters`     | Validate the object parsed from the configuration's `taskParameters` JSON string                                                                                           |
| `describe`                | Supply name, I/O, metric and parameter help for the website and chat agent                                                                                                 |
| `scenarios`               | Return 1–12 predefined scenario dictionaries                                                                                                                               |
| `generate`                | Deterministic CPU tensors: inputs `[steps, examples, channels]` and targets, with separate train, validation, confirmation-train, confirmation-validation and test domains |
| `loss`                    | Scalar differentiable loss for optimizer and checkpoint selection                                                                                                          |
| `score`                   | Finite, normalized [0,1] score; higher is better                                                                                                                           |
| `decode`, `probabilities` | JSON-serializable predictions and optional confidence values for evidence/replay                                                                                           |

The default hooks implement classification. A regression adapter is exercised in `test_discovery.py` using the same unmodified search worker. Some internal fields retain the compatibility name `accuracy`, but they store the adapter's normalized score; the evidence heading uses its metric name. The current sampling budget must be divisible by output width, with at least two examples per output.

The registry feeds the task selector and AI guide dynamically. Supporting a new environment still requires implementing and validating its adapter; an arbitrary game or robot world cannot become a valid benchmark just by naming it in chat. Interactive reinforcement learning, custom simulators, independent digital-world renderers, distributed search, and learning research strategies across campaigns are future extensions, not claims of this release.

## Tests

```sh
python -m unittest research.lab.test_discovery research.lab.test_lab
npm run test:local
npm run build
PYTHONPATH=. python scripts/validate_discovery_graph.py
```

The graph smoke script extracts the pinned graph into `.validation/` if necessary, executes a deliberately tiny real-graph campaign and verifies its export. It is a compute-path check, not a scientific benchmark result. See `validation-discovery.md` for this delivery's actual results and remaining environment limitations.
