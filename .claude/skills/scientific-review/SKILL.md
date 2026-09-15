---
name: scientific-review
description: Validate a change to graph data, training, lineage, reproducibility, replay, or scientific claims.
---

# Scientific Review

Read `research/PROTOCOL.md`, relevant worker protocol and numerical tests, and source manifests. Trace provenance from measured graph through copies/configuration, seeds/data splits, training, validation checkpoint selection, held-out confirmation, stored artifacts and replay. Check numerical gradients/direction with independent fixtures; distinguish speed measurements from timing assumptions.

Use `make test-python` and `make test-research` as relevant. Never regenerate public example results, archives or hashes merely to make a check pass. Explain intentional protocol/version changes and verify preserved recorded artifacts. Report actual measured evidence, limitations, and whether the claimed biological/engineering conclusion is supported. Do not turn schematic arena movement into an embodied-policy claim.
