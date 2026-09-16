import type { Provider } from '@/lib/contracts/providers';
/** Billing tier a call ran under; anything unrecognized is priced as standard. */
export type ServiceTier = 'standard' | 'flex' | 'priority' | 'fast';
/** Token counts reported by a provider, normalized across OpenAI and Anthropic. */
export type TokenUsage = {
  /** Uncached input tokens billed at the full input rate. */
  input: number;
  /** Output tokens, including any reasoning tokens. */
  output: number;
  /** Input tokens served from the provider prompt cache. */
  cacheRead: number;
  /** Input tokens written to the 5-minute provider prompt cache (Anthropic only). */
  cacheWrite: number;
  /** Input tokens written to the 1-hour prompt cache (Anthropic only). */
  cacheWrite1h: number;
  serviceTier: ServiceTier;
  /** Reasoning tokens included in `output` (OpenAI reports these separately). */
  reasoning: number;
  requestId: string | null;
};
/** USD per one million tokens, as stored in `lab.model_prices`. Tier rates are optional. */
export type ModelRates = {
  input: number;
  output: number;
  cacheRead: number | null;
  cacheWrite: number | null;
  cacheWrite1h?: number | null;
  inputFlex?: number | null;
  outputFlex?: number | null;
  cacheReadFlex?: number | null;
  inputPriority?: number | null;
  outputPriority?: number | null;
  cacheReadPriority?: number | null;
  /** Price multiplier for Anthropic fast mode relative to standard rates. */
  fastMultiplier?: number | null;
};
export type ModelPrice = ModelRates & {
  provider: Provider;
  model: string;
  source: string;
  sourceUrl: string | null;
  updatedAt: string;
};
export type CallCost = {
  usd: number | null;
  priced: boolean;
  usage: TokenUsage;
};
export type SpendAlert = {
  id: number;
  thresholdUsd: number;
  totalUsd: number;
  triggeredAt: string;
  acknowledgedAt: string | null;
};
export type CostFilters = {
  from?: string;
  to?: string;
  experimentId?: string;
  provider?: Provider;
  model?: string;
  keyHint?: string;
  surface?: string;
};
export type CostBucket = {
  key: string;
  label: string;
  usd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  unpriced: number;
};
export type CostTotals = {
  usd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  unpriced: number;
};
export type UsageRow = {
  id: string;
  provider: Provider;
  model: string;
  credentialSource: 'personal' | 'site';
  keyHint: string;
  surface: string;
  experimentId: string | null;
  campaignId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  serviceTier: ServiceTier;
  /** False when the call's tier had no stored rate and standard rates were used instead. */
  tierRateExact: boolean | null;
  usd: number | null;
  createdAt: string;
};
export type BillingConnection = {
  provider: Provider;
  status: 'connected' | 'missing';
  hint?: string;
  lastSync: BillingSync | null;
};
export type BillingSync = {
  id: number;
  provider: Provider;
  startedAt: string;
  finishedAt: string | null;
  fromDay: string;
  toDay: string;
  status: 'running' | 'succeeded' | 'failed';
  rowsUpserted: number;
  error: string | null;
};
/** One day of estimated versus provider-billed spend for one provider. */
export type ReconciliationDay = {
  day: string;
  provider: Provider;
  estimatedUsd: number;
  billedUsd: number | null;
};
export type Reconciliation = {
  days: ReconciliationDay[];
  byProvider: {
    provider: Provider;
    estimatedUsd: number;
    billedUsd: number | null;
    coveredDays: number;
  }[];
};
export type DailyPoint = { day: string; openai: number; anthropic: number; calls: number };
export type CostSummary = {
  filters: CostFilters;
  totals: CostTotals;
  lifetimeUsd: number;
  byProvider: CostBucket[];
  byModel: CostBucket[];
  byKey: CostBucket[];
  bySurface: CostBucket[];
  byExperiment: CostBucket[];
  byDay: DailyPoint[];
  recent: UsageRow[];
  reconciliation: Reconciliation;
};
export type PricingRefresh = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  sourceUrl: string;
  status: 'running' | 'succeeded' | 'failed';
  modelsUpdated: number;
  error: string | null;
};
/** Effective per-million rates for the tier a call ran under, falling back to standard rates. */
export function ratesForTier(rates: ModelRates, tier: ServiceTier) {
  const base = {
    input: rates.input,
    output: rates.output,
    cacheRead: rates.cacheRead ?? rates.input,
    cacheWrite: rates.cacheWrite ?? rates.input,
    cacheWrite1h: rates.cacheWrite1h ?? rates.cacheWrite ?? rates.input,
    exact: true,
  };
  if (tier === 'flex')
    return rates.inputFlex != null && rates.outputFlex != null
      ? {
          ...base,
          input: rates.inputFlex,
          output: rates.outputFlex,
          cacheRead: rates.cacheReadFlex ?? rates.inputFlex,
        }
      : { ...base, exact: false };
  if (tier === 'priority')
    return rates.inputPriority != null && rates.outputPriority != null
      ? {
          ...base,
          input: rates.inputPriority,
          output: rates.outputPriority,
          cacheRead: rates.cacheReadPriority ?? rates.inputPriority,
        }
      : { ...base, exact: false };
  if (tier === 'fast') {
    const m = rates.fastMultiplier;
    return m != null
      ? {
          ...base,
          input: base.input * m,
          output: base.output * m,
          cacheRead: base.cacheRead * m,
          cacheWrite: base.cacheWrite * m,
          cacheWrite1h: base.cacheWrite1h * m,
        }
      : { ...base, exact: false };
  }
  return base;
}
/** Total cost in USD for the given usage at the given per-million-token rates. */
export function costFor(rates: ModelRates, usage: TokenUsage): number {
  const r = ratesForTier(rates, usage.serviceTier);
  const usd =
    (usage.input * r.input +
      usage.output * r.output +
      usage.cacheRead * r.cacheRead +
      usage.cacheWrite * r.cacheWrite +
      usage.cacheWrite1h * r.cacheWrite1h) /
    1e6;
  return Math.round(usd * 1e8) / 1e8;
}
/** Candidate pricing ids for a provider model id, most specific first. */
export function priceLookupIds(model: string): string[] {
  const ids = [model];
  const undated = model.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-\d{8}$/, '');
  if (undated !== model) ids.push(undated);
  const unversioned = undated.replace(/-(latest|preview)$/, '');
  if (unversioned !== undated) ids.push(unversioned);
  return ids;
}
export function formatUsd(value: number | null | undefined, precise = false): string {
  if (value == null) return '—';
  if (value === 0) return '$0.00';
  if (precise || Math.abs(value) < 0.01)
    return (
      '$' + value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    );
  return (
    '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}
