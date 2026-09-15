# Shared agent toolkit

Adapted from the local Lunaris repository: journey, codereview, enterprise-ui, FastAPI guidance, the four original reviewer roles, and its generic Makefile blueprint. Added lab-specific security, scientific provenance, and Next.js reviewers. Workflows were rewritten to use this repository's commands, paths, unittest/PGlite tests, localhost model, and source-hash requirements.

The LangGraph/Deep Agents/LangSmith/RAG/swarm SDK, video pipelines, personal settings/hooks, course-building plans, and old memories were not imported: the lab does not use those runtimes. No links point back into Lunaris. This toolkit is intentionally version-controlled.

Claude loads `.claude/skills` and `.claude/agents`. Codex discovers `.agents/skills` (linked to the same source) and `.codex/agents/*.toml`. `AGENTS.md` links to `CLAUDE.md`. On Windows, enable Git symlink support/Developer Mode when cloning. `make check-agents` validates links, metadata and registrations; restart/reload the coding client after adding project skills if it does not refresh automatically.

Official references: [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [Claude subagents](https://code.claude.com/docs/en/sub-agents), [uv projects](https://docs.astral.sh/uv/guides/projects/).
