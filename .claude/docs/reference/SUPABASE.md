# Supabase

The authoritative schema is `supabase/migrations`. Test it against real Postgres semantics via PGlite or the local service. Preserve the lab schema grants/revocations, owner-scoped credential queries, migration history, indexes, and durable jobs. Use separate bound values with SQL placeholders. Never reset a developer database to make startup pass. Generated runtime ports/config belong under `.local-data`, not in committed Supabase config. Do not print status JSON containing keys.
