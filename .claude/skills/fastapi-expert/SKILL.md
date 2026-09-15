---
name: fastapi-expert
description: Implement or review this lab’s Python FastAPI trainer endpoints and request contracts.
---

# Fastapi Expert

Inspect `research/lab/service.py`, `protocol.py`, `discovery_contract.py`, and existing HTTP tests. Keep transport validation separate from numerical execution and preserve owner/token checks and durable queue semantics. Use the current FastAPI/Pydantic versions in uv.lock; consult official docs for changed APIs. Do not invent SQLAlchemy/JWT dependencies or convert the existing worker architecture merely because those patterns are common.

Check request bounds, cancellation, idempotent submissions, safe artifacts, and resource cleanup. Run fully qualified unittest modules with `make test-python`; use actual ASGI/HTTP state and real fixture storage. Numerical source edits must preserve or intentionally version checkpoint provenance. Explain endpoint behavior and validation gaps.
