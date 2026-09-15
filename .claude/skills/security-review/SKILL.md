---
name: security-review
description: Review this lab for reachable security defects in HTTP, credentials, storage, network routing, and local orchestration.
---

# Security Review

Apply `.claude/agents/security-reviewer.md`; include `supabase-security-reviewer` for schema/SQL changes. Map entrypoints, trust boundaries, sensitive assets and effects. Inspect localhost/origin checks, provider/trainer secret handling, owner filters, SSRF/DNS/redirects, bounded request bodies, artifact traversal, and subprocess/container ownership. Use non-destructive local fixtures; do not probe third-party endpoints or print secrets. For each finding show the trigger, reachable effect, file/line evidence, impact and narrow remediation. Distinguish known baseline debt and optional hardening from exploitable defects. Review-only means no edits or infrastructure changes.
