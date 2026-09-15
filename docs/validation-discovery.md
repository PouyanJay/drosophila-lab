# Discovery validation — 15 September 2026

## Passed

- Production Next.js build, TypeScript and static generation.
- Fourteen Python trainer/discovery tests with PyTorch 2.5.1+cpu, NumPy 2.2.6 and SciPy 1.15.3:
  - deterministic, balanced, separate data splits;
  - real structural changes without source mutation, forward-output differences and gradients into added neurons;
  - all three built-in adapters through the same search;
  - a continuous regression adapter with custom I/O, loss and score through that unchanged search;
  - interrupted/resumed candidate history matching an uninterrupted run;
  - bounded-budget completion without a false improvement;
  - owner isolation, idempotency and configuration rejection;
  - finalist selection before any test access, real held-out decision replay and tamper rejection;
  - API queue → pause/resume → actual training → completed result → service reopen → artifact checksum;
  - the original trainer's regression tests.
- Seven embedded-Postgres persistence tests, including discovery draft/campaign/review-state persistence across database reopen and invalid discovery configuration rejection.
- Production HTTP startup, foreign Host/Origin/cross-site rejection, and bundled local morphology response.
- A small campaign on the actual 165,122-neuron / 6,235,682-edge graph: original plus two structural candidates, training and validation, modified graph export and manifest verification.

The full-graph smoke campaign returned **no improvement**. Its tiny two-update training budgets are intended to exercise the compute path, not establish a useful brain. Because its finalist had no positive validation gain, the worker correctly skipped sealed-test confirmation. The separate fixture test covers that confirmation and replay path: it forces only validation ranking to reach the phase, while training, test measurements and replay are real. That fixture is a software test, not research evidence.

A separate full-graph forward check at delays 6 and 12 found nonzero output changes for duplication/divergence, recurrent loops and rewiring (maximum logit differences approximately 4e-6 to 4e-5). A structural change affecting output is not proof of better task accuracy.

## Remaining environment limitations

- Docker daemon access is unavailable here. Real Supabase container startup, the Python Postgres connection, restart and backup/restore integration still need a Docker-enabled machine. Persistence SQL was tested using embedded Postgres, and the trainer service integration used its standalone SQLite test store. The actual local launcher continues to use Supabase Postgres.
- Browser screenshot QA was attempted, but the Chromium download timed out. Build/HTTP checks do not establish visual correctness or WebGPU behavior.
- Live OpenAI/Claude calls were not exercised without user credentials. Offline configuration and numerical discovery do not require those calls.

No hosted deployment or GitHub publication was performed. Exported research variants distinguish experimental outputs from a confirmed task-specific improvement; no improved full fly brain is claimed by this delivery.
