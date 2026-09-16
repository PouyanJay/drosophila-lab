# LLM cost tracking: implementation

## Tasks

- [x] Migration `supabase/migrations/20260916000000_llm_costs.sql`: `model_prices` (78 seeded
      OpenAI/Claude chat models, USD per million tokens, from the LiteLLM list on 2026-09-15),
      `pricing_refreshes`, `llm_usage`, `cost_settings` (alert step, default $50), `spend_alerts`.
      Anonymous/authenticated grants revoked on tables and sequences.
- [x] `src/lib/contracts/costs.ts`: browser-safe types, `costFor`, `priceLookupIds`, `formatUsd`.
- [x] `src/server/llm-costs.ts`: usage normalization for both providers (cache read/write,
      reasoning tokens), price resolution with dated-id fallback, `recordUsage` + step alerts,
      `recordUsageSafely` (a bookkeeping failure never discards a paid reply), online refresh
      with failure logging, and `costSummary` with per-experiment/model/key/provider/surface/day
      breakdowns honoring drill-through filters.
- [x] Routes: `GET /api/costs`, `GET|POST /api/costs/prices`, `GET|POST|PATCH /api/costs/alerts`.
      Mutations require same-origin; all require the local workspace user.
- [x] Guide and discovery guide routes record usage with credential source, key hint, session id
      (new optional `sessionId` input), and campaign id; replies carry `cost`.
- [x] Studio: session id sent with every guide call, per-reply cost next to the model name,
      wallet badge with the experiment's running total, alert banner with acknowledge, and the
      Spending dialog (overview tiles, daily stacked bars by provider with table view, click-to-
      filter breakdowns, recent calls, pricing table with online refresh + history, alert step).
- [x] Tests `tests/local/costs.test.mjs` (PGlite, real migrations): usage normalization, cost
      math, seeded pricing incl. dated ids, unpriced models, summary filters and experiment
      names, alert idempotence across multiple crossed steps, refresh success/HTTP failure/
      invalid payload leaving prices intact, guide route end to end with mocked provider HTTP,
      anon role denial.

- [x] Reviews applied (web, Supabase, security, tests): dialog width override fixed with a
      higher-specificity selector; billed-but-invalid replies (truncated output, unparseable JSON)
      are now recorded on both guide routes; "not recorded" is shown distinctly from "unpriced";
      out-of-order filter fetches are ignored; pricing load errors get a retry state; alert
      backfill is limited to boundaries crossed by the current call; price payload capped at
      16 MB; token counts and date filters normalized before storage/queries.

## Round two: overcoming the stated limits

- [x] Migration `20260917000000_llm_cost_reconciliation.sql`: flex/priority/1h-cache/fast-mode
      rate columns (seeded for 68 models), `service_tier` and `cache_write_1h_tokens` on usage,
      `billing_connections` (sealed admin keys), `provider_costs` (daily billed line items), and
      `billing_syncs`. Grants revoked again.
- [x] Tier-aware pricing: OpenAI `service_tier` (flex/priority) and Anthropic `speed: fast`,
      `service_tier: priority`, and 1-hour cache writes are read from responses; `ratesForTier`
      falls back to standard rates when a tier rate is missing.
- [x] Reconciliation: admin keys verified against the provider cost endpoint before being sealed
      and stored; `POST /api/costs/billing/sync` pulls OpenAI `/v1/organization/costs` (grouped
      by line item) and Anthropic `/v1/organizations/cost_report` (grouped by description, cents
      to dollars) with pagination, and replaces the stored day range. The summary now carries
      estimated versus billed per day and provider; the Billing tab and an overview tile show it.
      Anthropic's admin API requires a Console organization (not available to individual
      accounts); billed totals cover the whole organization.
- [x] Freshness: `POST /api/costs/prices?ifStale=7` skips when a successful refresh is recent;
      the launcher calls it after the website is healthy and never fails startup. Models without
      a stored rate are flagged `priced: false` on `/api/providers` and marked in the model menu.
- [x] `make live-cost-check` (`scripts/live-cost-check.mjs`): one tiny real guide call through
      the running site, then reads the ledger row back. Refuses without `LIVE_COST_CHECK=1` and
      without a connected provider key. Not run for real here: no provider key is connected in
      this workspace.

- [x] Round-two reviews (web, security) applied: reconciliation compares whole UTC days on
      both sides (a partial boundary day is dropped), the Billing tab states that it ignores
      experiment/model/key/surface filters and hides those chips, tier-rate fallback is stored
      (`exact: false`) and shown in Calls, billing load/verify/sync errors have distinct alert
      states with retry, admin-key inputs use `autoComplete="new-password"`, cost report bodies
      are capped at 16 MB with a 12-page guard, oversized sync bodies return 413, the launcher
      hook times out after 8 s with an explicit message, and the live check reports failures
      through the dispatcher instead of exiting.

## Validation evidence

- `node --test tests/local/costs.test.mjs`: 16/16 pass (adds tier normalization and pricing,
  unpriced model flags, stale-refresh skip, admin key verification and sealing, provider cost
  sync with pagination for both providers, failed sync keeping rows, reconciliation totals).
- `pnpm test`: 34/34 pass. `pnpm exec tsc --noEmit`: clean. `pnpm lint`: 0 errors, 19 warnings
  (the existing allowance; no new warnings). `pnpm format:check`: clean. `pnpm build`: succeeds.
- Live workspace (`make run` applied the migration): `GET /api/costs`, `/api/costs/prices`,
  `/api/costs/alerts` respond; `POST /api/costs/prices` fetched the online list and updated 78
  models; cross-origin mutation returns 403. Headless Chromium screenshots of the Spending
  dialog (overview, calls, pricing, alerts) rendered without console errors, using temporary
  sample rows that were deleted afterwards (ledger left empty).
- Chart palette (Claude `#66a834`, OpenAI `#4585d0`) validated with the dataviz palette script
  in dark mode against `#111720`: all checks pass.

## Limits

- Provider calls in tests are mocked at the HTTP boundary. The live check exists but was not
  executed because no provider key is connected in this workspace.
- Batch pricing is not modelled because the lab never uses batch endpoints. Account discounts
  and credits are only visible through the billed reconciliation, not the estimate.
