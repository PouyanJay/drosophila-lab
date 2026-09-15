---
name: codereview
description: Review a requested diff, working tree, commit, or branch for correctness, security, tests, and maintainability.
---

# Codereview

Establish the requested scope using `git status`, the current branch, and an appropriate comparison. On main, review uncommitted changes or the requested commit; do not reject main or require an empty working tree. Include untracked relevant files. If no scope/diff can be inferred, ask for the target.

Run or reuse relevant checks (`make lint`, `make test`, `make build`) and record failures. Continue static review when an unavailable external service blocks a check; report the gap instead of pretending the gate passed. Existing lint baseline is not new debt.

| Changed surface                                            | Reviewers/workflow                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Python                                                     | python-code-reviewer, test-code-reviewer                         |
| React/Next.js/browser workers                              | web-code-reviewer, test-code-reviewer; enterprise-ui for visuals |
| SQL/database                                               | supabase-security-reviewer                                       |
| Authentication, credentials, network, processes, artifacts | security-reviewer                                                |
| Models, datasets, training or claims                       | scientific-reviewer                                              |
| All substantial changes                                    | coding-style-reviewer                                            |

Delegate independent, bounded reviews when supported; pass the same scope, test evidence, and relevant decisions. Otherwise read the matching `.claude/agents/*.md` and apply them sequentially. Reviewers do not edit files. Consolidate duplicates into blocking defects, important issues, and optional suggestions. Every finding needs file/line evidence and concrete impact. State checks, coverage gaps, and recommendation. Do not fix, commit, or publish during a review-only request unless asked.
