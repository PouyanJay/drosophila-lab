# LLM cost tracking

## Scope

Record every paid provider call (experiment guide and discovery guide), price it from a
Supabase pricing table, and expose spend by experiment, model, provider, API key, surface,
and day. Alert every $50 of cumulative spend (step configurable). Provide a manual refresh
that updates pricing rows from an online source, plus a bundled snapshot seeded by migration.

## Success criteria

- `lab.model_prices`, `lab.llm_usage`, `lab.spend_alerts`, `lab.cost_settings`,
  `lab.pricing_refreshes` exist with anon/authenticated access revoked.
- Guide and discovery guide calls insert one `llm_usage` row with tokens, cost, key hint,
  credential source, session (experiment) id, campaign id when known, and the price snapshot used.
- Crossing each $50 boundary creates exactly one `spend_alerts` row; alerts surface in the UI.
- `POST /api/costs/prices/refresh` fetches the LiteLLM price list (which cites OpenAI and
  Anthropic pricing pages), upserts openai/anthropic chat models, and logs the refresh.
- Per-message cost is shown in the conversation; the spending dashboard shows totals,
  breakdowns and a daily chart with drill-through filters.
- Failure paths tested: unknown model (cost null, flagged unpriced), refresh source failure
  (rows untouched, refresh logged as failed), alert idempotence.

## Decisions

- Pricing source: LiteLLM `model_prices_and_context_window.json`. Neither provider offers a
  pricing API; this file is community maintained, machine readable, cites the official pages,
  and includes cache read/write rates for both providers.
- Costs are computed at call time and stored with the rates used, so later price edits do
  not rewrite history.
- Unknown models are recorded with `cost_usd` NULL and appear as "unpriced" in the UI.
