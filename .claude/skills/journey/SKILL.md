---
name: journey
description: Implement a substantial feature or regression through scoped planning, behavior tests, verification, and review; supports resuming recorded work.
---

# Journey

Read the user request and current code before asking questions. If requirements are clear, proceed; otherwise ask only the material missing questions together and continue independent work. Do not require a Q&A ceremony for an already specified task.

Record substantial work under `.claude/plans/<slug>/requirements.md` and `implementation.md`: scope, success criteria, decisions, task states, validation evidence. Do not put credentials or private user data in these version-controlled notes.

For each task: identify touched surfaces → reproduce/define meaningful behavior → implement the smallest complete slice → run relevant `make` checks → inspect actual output/state → apply appropriate reviewers → fix supported findings. A cross-layer skeleton is useful when the integration is new; do not manufacture one for an existing simple path. Unit/contract tests and boundary mocks remain valid when they prove the behavior.

Choose reviewers from codereview's surface table. Delegate independent reviews if supported; otherwise apply their instructions sequentially and disclose the limitation. Do not claim all reviews ran when only a self-review ran. Stop repeating tests once unchanged code is covered.

Resume: read the saved notes, verify current Git state, continue the first incomplete task. Regression: reproduce the reported issue, rerun the relevant fixture, and fix within scope. Preserve scientific hashes and durable state. Commit/push only when authorized by the user's task; otherwise leave a reviewable diff and report completion.
