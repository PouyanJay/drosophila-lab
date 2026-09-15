# Discovery implementation map

The goal is a reusable research mechanism with multiple task adapters, actual topology changes and honest, reproducible evidence. Better memory is the first objective; slower models are allowed within a configurable bound.

| Work item                     | Implementation                                                                                                          | Verification                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Versioned experiment contract | Python and Zod schema, bounded search/data budgets, task parameter validation                                           | Invalid settings and unsupported adapters rejected                       |
| Extensible tasks              | Versioned deterministic scenarios, I/O, loss, score and decoding hooks                                                  | Three built-in tasks plus a custom regression adapter                    |
| Structural edits              | Source-preserving sparse graph copies, recorded additions/rewires and matched probe readout                             | Different forward outputs, gradients reach edges and added neurons       |
| Persistent discovery worker   | Pilot promotion, paired full training, bounded lineage, time/stagnation stopping                                        | Same worker across adapters and valid budget exhaustion                  |
| Resumable training            | Atomic optimizer/RNG/weights and campaign state, code/config identity guard                                             | Interrupted run matches uninterrupted candidate history                  |
| Sealed confirmation           | One frozen finalist, fresh seeds/data, gain interval and slowdown criterion                                             | Test access only after selection; actual decision replay                 |
| Version artifacts             | Graph, trained original/candidate, datasets, hashes, source and model card                                              | Bundle checksums, tamper rejection, unconfirmed status                   |
| Local service                 | Owner-scoped discovery endpoints on existing Postgres-backed queue                                                      | Queue/resume/completion/artifact/reopen integration on engine test store |
| Single workspace UI           | Composer discovery switch, validated chat draft, inline controls, candidate/loss/test evidence, atlas source inspection | Production build and HTTP checks; screenshot limitation documented       |
| Durable conversation          | Save mode, draft, ready state and campaign reference through records/outbox                                             | Embedded Postgres save/reopen test                                       |

The local launcher and existing backup workflow include this worker without a separate compute-connection setup. No hosted deployment, GitHub publication or scientific improvement is asserted by implementation alone.
