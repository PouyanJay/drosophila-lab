# Agent-driven discovery — planning requirements

Status: design draft for discussion; implementation is not authorized by this planning request.

## User outcome

Build a discovery service where AI agents research a task, investigate a source brain, propose and test structural changes, learn from measured results, and communicate progress through chat and the UI. Publish usable brain variants on Hugging Face. Reimport descendants for further discovery, and later investigate composition of multiple brains for multiple tasks.

## Required properties

- LLMs participate in experiment selection during a campaign, not just setup or explanations.
- Research includes cited literature, graph inspection, behavioral diagnostics, hypotheses, experiments, and critique.
- Training and scoring remain measured, with immutable task contracts and independent confirmation.
- Graph changes have explicit source/parent ancestry and reversible, validated edit programs.
- A common versioned package/loader works for the original, a variant, and supported composites; distinguish compute topology from biological morphology.
- Campaigns survive page closure/restarts; users see actual lifecycle events, decisions, costs, failures, and evidence.
- Budgets, model choice, authorized edits, and autonomy are visible and configurable.
- Preserve the existing UI design; review additive visual proposals before implementation.
- No improvement is an acceptable result; improvement is not promised.

## Open user decisions

1. **Decided by user:** unrestricted architecture invention, new modules and agent-written operators; this is required in v1.
2. **Accepted as initial planning budget:** $5 calibration, $15 shakedown, then a $50 / six-hour first campaign; no paid execution authorized. Host inspected: M5, 32 GiB, 10 physical CPU cores, Docker ~7.75 GiB.
3. **Decided:** retain the existing design; new research views extend chat, atlas, evidence drawer and Spending. Standalone replacement layouts are superseded.
4. First reference task and definition of a worthwhile gain; should follow discussion of candidate benchmark difficulty.
5. Default publication workflow and Hugging Face namespace, when publishing is implemented.

## Proposed acceptance

An agent launches a recorded, validated experiment, consumes real validation evidence, and makes an evidence-dependent next proposal. It can finish with a frozen independently confirmed candidate or an honest no-improvement report. A fresh environment imports an exported variant, reproduces its recorded inference, and uses it as a new campaign parent. The UI reflects this process without fabricated narration, raw private reasoning, or hidden budget overruns.

Main design: [agentic-discovery-plan.md](../../../docs/agentic-discovery-plan.md).
