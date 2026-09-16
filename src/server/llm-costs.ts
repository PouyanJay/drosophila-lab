import {
  costFor,
  priceLookupIds,
  ratesForTier,
  type CallCost,
  type CostBucket,
  type CostFilters,
  type CostSummary,
  type DailyPoint,
  type ModelPrice,
  type BillingConnection,
  type BillingSync,
  type ModelRates,
  type PricingRefresh,
  type Reconciliation,
  type ReconciliationDay,
  type ServiceTier,
  type SpendAlert,
  type TokenUsage,
  type UsageRow,
} from '@/lib/contracts/costs';
import type { Provider } from '@/lib/contracts/providers';
import { sealCredential, unsealCredential } from '@/server/credential-crypto';
import { database } from '@/server/database';
import 'server-only';

const MAX_PRICE_LIST_BYTES = 16 * 1024 * 1024;
export const PRICE_SOURCE_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? 0 : Number(v));
/** Provider token counts as stored: finite, whole, and never negative. */
const count = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};
const numOrNull = (v: unknown) => (v == null ? null : Number(v));
const str = (v: unknown) => (v == null ? null : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

function objectAt(source: unknown, key: string): Row | null {
  if (source && typeof source === 'object' && key in source) {
    const value = (source as Row)[key];
    return value && typeof value === 'object' ? (value as Row) : null;
  }
  return null;
}

/** Read the token usage block from a raw provider response body. */
export function usageFromResponse(provider: Provider, body: unknown): TokenUsage {
  const usage = objectAt(body, 'usage') ?? {};
  const top = (body && typeof body === 'object' ? body : {}) as Row;
  const requestId = str(top.id) ?? null;
  if (provider === 'openai') {
    const cacheRead = count(objectAt(usage, 'input_tokens_details')?.cached_tokens);
    const input = Math.max(0, count(usage.input_tokens) - cacheRead);
    const tier = top.service_tier;
    return {
      input,
      output: count(usage.output_tokens),
      cacheRead,
      cacheWrite: 0,
      cacheWrite1h: 0,
      reasoning: count(objectAt(usage, 'output_tokens_details')?.reasoning_tokens),
      serviceTier: tier === 'flex' || tier === 'priority' ? tier : 'standard',
      requestId,
    };
  }
  const cacheWrite1h = count(objectAt(usage, 'cache_creation')?.ephemeral_1h_input_tokens);
  const tier: ServiceTier =
    usage.speed === 'fast' ? 'fast' : usage.service_tier === 'priority' ? 'priority' : 'standard';
  return {
    input: count(usage.input_tokens),
    output: count(usage.output_tokens),
    cacheRead: count(usage.cache_read_input_tokens),
    cacheWrite: Math.max(0, count(usage.cache_creation_input_tokens) - cacheWrite1h),
    cacheWrite1h,
    reasoning: 0,
    serviceTier: tier,
    requestId,
  };
}

function priceFromRow(r: Row): ModelPrice {
  return {
    provider: r.provider as Provider,
    model: String(r.model),
    input: num(r.input_per_mtok),
    output: num(r.output_per_mtok),
    cacheRead: numOrNull(r.cache_read_per_mtok),
    cacheWrite: numOrNull(r.cache_write_per_mtok),
    cacheWrite1h: numOrNull(r.cache_write_1h_per_mtok),
    inputFlex: numOrNull(r.input_flex_per_mtok),
    outputFlex: numOrNull(r.output_flex_per_mtok),
    cacheReadFlex: numOrNull(r.cache_read_flex_per_mtok),
    inputPriority: numOrNull(r.input_priority_per_mtok),
    outputPriority: numOrNull(r.output_priority_per_mtok),
    cacheReadPriority: numOrNull(r.cache_read_priority_per_mtok),
    fastMultiplier: numOrNull(r.fast_multiplier),
    source: String(r.source),
    sourceUrl: str(r.source_url),
    updatedAt: iso(r.updated_at),
  };
}

/** Find the stored rates for a model, tolerating dated or aliased ids. */
export async function resolvePrice(provider: Provider, model: string): Promise<ModelPrice | null> {
  const ids = priceLookupIds(model);
  const result = await database().query(
    'SELECT * FROM model_prices WHERE provider = $1 AND model = ANY($2::text[])',
    [provider, ids],
  );
  const rows = result.rows as Row[];
  for (const id of ids) {
    const row = rows.find((r) => r.model === id);
    if (row) return priceFromRow(row);
  }
  return null;
}

export async function listPrices(): Promise<ModelPrice[]> {
  const result = await database().query('SELECT * FROM model_prices ORDER BY provider, model');
  return (result.rows as Row[]).map(priceFromRow);
}

export type UsageEntry = {
  userId: string;
  provider: Provider;
  model: string;
  credentialSource: 'personal' | 'site';
  keyHint: string;
  surface: 'guide' | 'discovery-guide';
  experimentId?: string | null;
  campaignId?: string | null;
  usage: TokenUsage;
};

export type RecordedUsage = CallCost & { id: string; alerts: SpendAlert[] };

/** Price one call, store it, and raise any spend alerts that its cost crossed. */
export async function recordUsage(entry: UsageEntry): Promise<RecordedUsage> {
  const price = await resolvePrice(entry.provider, entry.model);
  const rates: ModelRates | null = price
    ? {
        input: price.input,
        output: price.output,
        cacheRead: price.cacheRead,
        cacheWrite: price.cacheWrite,
        cacheWrite1h: price.cacheWrite1h,
        inputFlex: price.inputFlex,
        outputFlex: price.outputFlex,
        cacheReadFlex: price.cacheReadFlex,
        inputPriority: price.inputPriority,
        outputPriority: price.outputPriority,
        cacheReadPriority: price.cacheReadPriority,
        fastMultiplier: price.fastMultiplier,
      }
    : null;
  const usd = rates ? costFor(rates, entry.usage) : null;
  const id = crypto.randomUUID();
  const db = database();
  await db.query(
    'INSERT INTO llm_usage (id,user_id,provider,model,credential_source,key_hint,surface,experiment_id,campaign_id,request_id,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,reasoning_tokens,cost_usd,rates,service_tier,cache_write_1h_tokens) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',
    [
      id,
      entry.userId,
      entry.provider,
      entry.model,
      entry.credentialSource,
      entry.keyHint,
      entry.surface,
      entry.experimentId ?? null,
      entry.campaignId ?? null,
      entry.usage.requestId,
      entry.usage.input,
      entry.usage.output,
      entry.usage.cacheRead,
      entry.usage.cacheWrite,
      entry.usage.reasoning,
      usd,
      rates
        ? JSON.stringify({
            ...ratesForTier(rates, entry.usage.serviceTier),
            priceModel: price?.model,
            source: price?.source,
          })
        : null,
      entry.usage.serviceTier,
      entry.usage.cacheWrite1h,
    ],
  );
  const alerts = usd ? await raiseAlerts(id, usd) : [];
  return { id, usd, priced: !!rates, usage: entry.usage, alerts };
}

/** Record usage without letting a bookkeeping failure discard an already-paid reply. */
export async function recordUsageSafely(
  entry: UsageEntry,
): Promise<RecordedUsage & { recorded: boolean }> {
  try {
    return { ...(await recordUsage(entry)), recorded: true };
  } catch (e) {
    console.warn('Model usage could not be recorded:', e instanceof Error ? e.message : e);
    return { id: '', usd: null, priced: false, usage: entry.usage, alerts: [], recorded: false };
  }
}

function alertFromRow(r: Row): SpendAlert {
  return {
    id: Number(r.id),
    thresholdUsd: num(r.threshold_usd),
    totalUsd: num(r.total_usd),
    triggeredAt: iso(r.triggered_at),
    acknowledgedAt: r.acknowledged_at ? iso(r.acknowledged_at) : null,
  };
}

/** Insert one alert per step boundary this call crossed; earlier boundaries are never backfilled. */
async function raiseAlerts(usageId: string, callUsd: number): Promise<SpendAlert[]> {
  const db = database();
  const step = await alertStep();
  const total = num(
    ((await db.query('SELECT COALESCE(SUM(cost_usd),0) AS total FROM llm_usage')).rows[0] as Row)
      .total,
  );
  const highest = num(
    (
      (await db.query('SELECT COALESCE(MAX(threshold_usd),0) AS m FROM spend_alerts'))
        .rows[0] as Row
    ).m,
  );
  const raised: SpendAlert[] = [];
  const before = Math.max(highest, total - callUsd);
  const first = Math.floor(before / step + 1e-9) * step + step;
  for (let i = 0; first + i * step <= total + 1e-9; i++) {
    const threshold = Math.round((first + i * step) * 100) / 100;
    const inserted = await db.query(
      'INSERT INTO spend_alerts (threshold_usd,total_usd,usage_id) VALUES ($1,$2,$3) ON CONFLICT (threshold_usd) DO NOTHING RETURNING *',
      [threshold, total, usageId],
    );
    if (inserted.rows[0]) raised.push(alertFromRow(inserted.rows[0] as Row));
  }
  return raised;
}

export async function alertStep(): Promise<number> {
  const row = (await database().query('SELECT alert_step_usd FROM cost_settings WHERE id = 1'))
    .rows[0] as Row | undefined;
  return row ? num(row.alert_step_usd) : 50;
}

export async function setAlertStep(step: number): Promise<number> {
  if (!Number.isFinite(step) || step <= 0) throw Error('Alert step must be a positive amount.');
  await database().query(
    'INSERT INTO cost_settings (id,alert_step_usd,updated_at) VALUES (1,$1,now()) ON CONFLICT (id) DO UPDATE SET alert_step_usd = excluded.alert_step_usd, updated_at = now()',
    [step],
  );
  return step;
}

export async function listAlerts(): Promise<SpendAlert[]> {
  const result = await database().query(
    'SELECT * FROM spend_alerts ORDER BY threshold_usd DESC LIMIT 200',
  );
  return (result.rows as Row[]).map(alertFromRow);
}

export async function acknowledgeAlert(id: number): Promise<boolean> {
  const result = await database().query(
    'UPDATE spend_alerts SET acknowledged_at = now() WHERE id = $1 AND acknowledged_at IS NULL RETURNING id',
    [id],
  );
  return result.rows.length > 0;
}

type PriceEntry = {
  litellm_provider?: string;
  mode?: string;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  cache_creation_input_token_cost_above_1hr?: number;
  input_cost_per_token_flex?: number;
  output_cost_per_token_flex?: number;
  cache_read_input_token_cost_flex?: number;
  input_cost_per_token_priority?: number;
  output_cost_per_token_priority?: number;
  cache_read_input_token_cost_priority?: number;
  provider_specific_entry?: { fast?: number };
  source?: string;
};

const CHAT_MODEL = /^(gpt-(?:4\.1|4o|[5-9])|o[134](?:-|$)|claude-)/;
const EXCLUDED_MODEL = /audio|realtime|transcrib|image|search|deep-research|instruct|tts|whisper/;

/** Convert the online price list into rows for `model_prices`. */
export function parsePriceList(payload: unknown): Omit<ModelPrice, 'updatedAt' | 'source'>[] {
  if (!payload || typeof payload !== 'object') throw Error('The price list is not an object.');
  const rows: Omit<ModelPrice, 'updatedAt' | 'source'>[] = [];
  const perMillion = (v: number | undefined) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 1e12) / 1e6 : null;
  for (const [model, raw] of Object.entries(payload as Record<string, PriceEntry>)) {
    if (!raw || typeof raw !== 'object' || raw.mode !== 'chat') continue;
    const provider = raw.litellm_provider;
    if (provider !== 'openai' && provider !== 'anthropic') continue;
    if (!CHAT_MODEL.test(model) || EXCLUDED_MODEL.test(model)) continue;
    if (provider === 'anthropic' && !model.startsWith('claude-')) continue;
    const input = perMillion(raw.input_cost_per_token),
      output = perMillion(raw.output_cost_per_token);
    if (input == null || output == null) continue;
    rows.push({
      provider,
      model,
      input,
      output,
      cacheRead: perMillion(raw.cache_read_input_token_cost),
      cacheWrite: perMillion(raw.cache_creation_input_token_cost),
      cacheWrite1h: perMillion(raw.cache_creation_input_token_cost_above_1hr),
      inputFlex: perMillion(raw.input_cost_per_token_flex),
      outputFlex: perMillion(raw.output_cost_per_token_flex),
      cacheReadFlex: perMillion(raw.cache_read_input_token_cost_flex),
      inputPriority: perMillion(raw.input_cost_per_token_priority),
      outputPriority: perMillion(raw.output_cost_per_token_priority),
      cacheReadPriority: perMillion(raw.cache_read_input_token_cost_priority),
      fastMultiplier:
        typeof raw.provider_specific_entry?.fast === 'number' &&
        raw.provider_specific_entry.fast >= 1
          ? raw.provider_specific_entry.fast
          : null,
      sourceUrl: typeof raw.source === 'string' ? raw.source : null,
    });
  }
  if (!rows.length) throw Error('The price list contained no OpenAI or Claude chat models.');
  return rows;
}

function refreshFromRow(r: Row): PricingRefresh {
  return {
    id: Number(r.id),
    startedAt: iso(r.started_at),
    finishedAt: r.finished_at ? iso(r.finished_at) : null,
    sourceUrl: String(r.source_url),
    status: r.status as PricingRefresh['status'],
    modelsUpdated: num(r.models_updated),
    error: str(r.error),
  };
}

export async function listRefreshes(limit = 10): Promise<PricingRefresh[]> {
  const result = await database().query(
    'SELECT * FROM pricing_refreshes ORDER BY started_at DESC LIMIT $1',
    [limit],
  );
  return (result.rows as Row[]).map(refreshFromRow);
}

/** True when no successful refresh happened within the last `days`. */
export async function pricesStale(days: number): Promise<boolean> {
  const row = (
    await database().query(
      "SELECT max(finished_at) AS last FROM pricing_refreshes WHERE status='succeeded'",
    )
  ).rows[0] as Row | undefined;
  if (!row?.last) return true;
  return Date.now() - new Date(iso(row.last)).getTime() > days * 86400000;
}

/** Fetch the online price list and upsert every supported model; failures leave prices untouched. */
export async function refreshPrices(
  fetchImpl: typeof fetch = fetch,
  sourceUrl = PRICE_SOURCE_URL,
): Promise<PricingRefresh> {
  const db = database();
  const started = (
    await db.query(
      "INSERT INTO pricing_refreshes (source_url,status) VALUES ($1,'running') RETURNING id",
      [sourceUrl],
    )
  ).rows[0] as Row;
  const refreshId = Number(started.id);
  try {
    const response = await fetchImpl(sourceUrl, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`The price source responded with HTTP ${response.status}.`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_PRICE_LIST_BYTES)
      throw Error('The price list is larger than expected and was not applied.');
    const rows = parsePriceList(JSON.parse(new TextDecoder().decode(bytes)));
    const source = 'litellm ' + new Date().toISOString().slice(0, 10);
    for (const r of rows)
      await db.query(
        'INSERT INTO model_prices (provider,model,input_per_mtok,output_per_mtok,cache_read_per_mtok,cache_write_per_mtok,source,source_url,updated_at,cache_write_1h_per_mtok,input_flex_per_mtok,output_flex_per_mtok,cache_read_flex_per_mtok,input_priority_per_mtok,output_priority_per_mtok,cache_read_priority_per_mtok,fast_multiplier) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (provider,model) DO UPDATE SET input_per_mtok=excluded.input_per_mtok,output_per_mtok=excluded.output_per_mtok,cache_read_per_mtok=excluded.cache_read_per_mtok,cache_write_per_mtok=excluded.cache_write_per_mtok,source=excluded.source,source_url=excluded.source_url,updated_at=now(),cache_write_1h_per_mtok=excluded.cache_write_1h_per_mtok,input_flex_per_mtok=excluded.input_flex_per_mtok,output_flex_per_mtok=excluded.output_flex_per_mtok,cache_read_flex_per_mtok=excluded.cache_read_flex_per_mtok,input_priority_per_mtok=excluded.input_priority_per_mtok,output_priority_per_mtok=excluded.output_priority_per_mtok,cache_read_priority_per_mtok=excluded.cache_read_priority_per_mtok,fast_multiplier=excluded.fast_multiplier',
        [
          r.provider,
          r.model,
          r.input,
          r.output,
          r.cacheRead,
          r.cacheWrite,
          source,
          r.sourceUrl,
          r.cacheWrite1h,
          r.inputFlex,
          r.outputFlex,
          r.cacheReadFlex,
          r.inputPriority,
          r.outputPriority,
          r.cacheReadPriority,
          r.fastMultiplier,
        ],
      );
    const done = (
      await db.query(
        "UPDATE pricing_refreshes SET status='succeeded', finished_at=now(), models_updated=$2 WHERE id=$1 RETURNING *",
        [refreshId, rows.length],
      )
    ).rows[0] as Row;
    return refreshFromRow(done);
  } catch (e) {
    const message =
      e instanceof Error && e.name === 'TimeoutError'
        ? 'The price source timed out.'
        : e instanceof Error
          ? e.message
          : 'Price refresh failed.';
    const failed = (
      await db.query(
        "UPDATE pricing_refreshes SET status='failed', finished_at=now(), error=$2 WHERE id=$1 RETURNING *",
        [refreshId, message.slice(0, 500)],
      )
    ).rows[0] as Row;
    return refreshFromRow(failed);
  }
}

function whereFor(filters: CostFilters): { sql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    clauses.push(sql.replace('?', '$' + values.length));
  };
  if (filters.from) add('u.created_at >= ?', filters.from);
  if (filters.to) add('u.created_at < ?', filters.to);
  if (filters.experimentId) add('u.experiment_id = ?', filters.experimentId);
  if (filters.provider) add('u.provider = ?', filters.provider);
  if (filters.model) add('u.model = ?', filters.model);
  if (filters.keyHint) add('u.key_hint = ?', filters.keyHint);
  if (filters.surface) add('u.surface = ?', filters.surface);
  return { sql: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', values };
}

const bucketColumns =
  'COALESCE(SUM(u.cost_usd),0) AS usd, COUNT(*) AS calls, COALESCE(SUM(u.input_tokens),0) AS input_tokens, COALESCE(SUM(u.output_tokens),0) AS output_tokens, COALESCE(SUM(u.cache_read_tokens),0) AS cache_read_tokens, COUNT(*) FILTER (WHERE u.cost_usd IS NULL) AS unpriced';

function bucketFromRow(r: Row, key: string, label: string): CostBucket {
  return {
    key,
    label,
    usd: num(r.usd),
    calls: num(r.calls),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    cacheReadTokens: num(r.cache_read_tokens),
    unpriced: num(r.unpriced),
  };
}

async function buckets(
  groupSql: string,
  where: { sql: string; values: unknown[] },
  label: (r: Row) => string,
  key: (r: Row) => string,
  join = '',
): Promise<CostBucket[]> {
  const result = await database().query(
    `SELECT ${groupSql} AS g, ${bucketColumns} FROM llm_usage u${join}${where.sql} GROUP BY g ORDER BY usd DESC, calls DESC LIMIT 100`,
    where.values,
  );
  return (result.rows as Row[]).map((r) => bucketFromRow(r, key(r), label(r)));
}

export function usageFromRow(r: Row): UsageRow {
  return {
    id: String(r.id),
    provider: r.provider as Provider,
    model: String(r.model),
    credentialSource: r.credential_source as UsageRow['credentialSource'],
    keyHint: String(r.key_hint),
    surface: String(r.surface),
    experimentId: str(r.experiment_id),
    campaignId: str(r.campaign_id),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    cacheReadTokens: num(r.cache_read_tokens),
    cacheWriteTokens: num(r.cache_write_tokens),
    reasoningTokens: num(r.reasoning_tokens),
    serviceTier: (r.service_tier as ServiceTier) ?? 'standard',
    tierRateExact: tierExactness(r.rates),
    usd: numOrNull(r.cost_usd),
    createdAt: iso(r.created_at),
  };
}
/** Whether the stored rate snapshot matched the call's tier (null when unpriced or unknown). */
function tierExactness(rates: unknown): boolean | null {
  if (typeof rates !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(rates);
    return parsed && typeof parsed === 'object' && 'exact' in parsed
      ? (parsed as { exact: unknown }).exact !== false
      : null;
  } catch {
    return null;
  }
}

/** Aggregate spend with breakdowns for the dashboard; every breakdown honors the filters. */
export async function costSummary(filters: CostFilters): Promise<CostSummary> {
  const db = database();
  const where = whereFor(filters);
  const totalsRow = (
    await db.query(
      `SELECT ${bucketColumns}, COALESCE(SUM(u.cache_write_tokens),0) AS cache_write_tokens, COALESCE(SUM(u.reasoning_tokens),0) AS reasoning_tokens FROM llm_usage u${where.sql}`,
      where.values,
    )
  ).rows[0] as Row;
  const lifetime = (await db.query('SELECT COALESCE(SUM(cost_usd),0) AS usd FROM llm_usage'))
    .rows[0] as Row;
  const experimentJoin =
    " LEFT JOIN lab_records r ON r.id = u.experiment_id AND r.kind = 'agent-session'";
  const [byProvider, byModel, byKey, bySurface, byExperiment] = await Promise.all([
    buckets(
      'u.provider',
      where,
      (r) => String(r.g),
      (r) => String(r.g),
    ),
    buckets(
      "u.provider || ':' || u.model",
      where,
      (r) => String(r.g).split(':').slice(1).join(':'),
      (r) => String(r.g),
    ),
    buckets(
      "u.provider || ' ' || u.credential_source || ' ' || u.key_hint",
      where,
      (r) => String(r.g),
      (r) => String(r.g).split(' ').slice(2).join(' '),
    ),
    buckets(
      'u.surface',
      where,
      (r) => String(r.g),
      (r) => String(r.g),
    ),
    buckets(
      "COALESCE(u.experiment_id,'') || '|' || COALESCE(r.name,'')",
      where,
      (r) => {
        const [id, name] = String(r.g).split('|');
        return name || (id ? 'Unsaved experiment ' + id.slice(0, 8) : 'No experiment');
      },
      (r) => String(r.g).split('|')[0],
      experimentJoin,
    ),
  ]);
  const days = (
    await db.query(
      `SELECT to_char(u.created_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS day, u.provider, COALESCE(SUM(u.cost_usd),0) AS usd, COUNT(*) AS calls FROM llm_usage u${where.sql} GROUP BY day, u.provider ORDER BY day`,
      where.values,
    )
  ).rows as Row[];
  const byDayMap = new Map<string, DailyPoint>();
  for (const r of days) {
    const day = String(r.day);
    const point = byDayMap.get(day) ?? { day, openai: 0, anthropic: 0, calls: 0 };
    if (r.provider === 'openai') point.openai += num(r.usd);
    else point.anthropic += num(r.usd);
    point.calls += num(r.calls);
    byDayMap.set(day, point);
  }
  const recent = (
    await db.query(
      `SELECT u.* FROM llm_usage u${where.sql} ORDER BY u.created_at DESC LIMIT 50`,
      where.values,
    )
  ).rows as Row[];
  return {
    filters,
    totals: {
      usd: num(totalsRow.usd),
      calls: num(totalsRow.calls),
      inputTokens: num(totalsRow.input_tokens),
      outputTokens: num(totalsRow.output_tokens),
      cacheReadTokens: num(totalsRow.cache_read_tokens),
      cacheWriteTokens: num(totalsRow.cache_write_tokens),
      reasoningTokens: num(totalsRow.reasoning_tokens),
      unpriced: num(totalsRow.unpriced),
    },
    lifetimeUsd: num(lifetime.usd),
    byProvider,
    byModel,
    byKey,
    bySurface,
    byExperiment,
    byDay: [...byDayMap.values()],
    recent: recent.map(usageFromRow),
    reconciliation: await reconciliation(filters),
  };
}

/** Whether a model id has a stored rate, tolerating dated aliases. */
export async function pricedModels(provider: Provider, ids: string[]): Promise<Set<string>> {
  const result = await database().query('SELECT model FROM model_prices WHERE provider = $1', [
    provider,
  ]);
  const known = new Set((result.rows as Row[]).map((r) => String(r.model)));
  return new Set(ids.filter((id) => priceLookupIds(id).some((c) => known.has(c))));
}

const billingId = (userId: string, p: Provider) => JSON.stringify(['billing', userId, p]);

function syncFromRow(r: Row): BillingSync {
  return {
    id: Number(r.id),
    provider: r.provider as Provider,
    startedAt: iso(r.started_at),
    finishedAt: r.finished_at ? iso(r.finished_at) : null,
    fromDay: dayOf(r.from_day),
    toDay: dayOf(r.to_day),
    status: r.status as BillingSync['status'],
    rowsUpserted: num(r.rows_upserted),
    error: str(r.error),
  };
}
const dayOf = (v: unknown) => iso(v).slice(0, 10);

export async function billingCredential(
  userId: string,
  provider: Provider,
): Promise<{ key: string; hint: string } | null> {
  const row = (
    await database().query(
      'SELECT sealed_key,key_hint FROM billing_connections WHERE id = $1 AND user_id = $2',
      [billingId(userId, provider), userId],
    )
  ).rows[0] as Row | undefined;
  if (!row) return null;
  return {
    key: await unsealCredential(
      String(row.sealed_key),
      process.env.PROVIDER_ENCRYPTION_KEY || '',
      billingId(userId, provider),
    ),
    hint: String(row.key_hint),
  };
}

export async function saveBillingCredential(userId: string, provider: Provider, key: string) {
  const id = billingId(userId, provider);
  const sealed = await sealCredential(key, process.env.PROVIDER_ENCRYPTION_KEY || '', id);
  await database().query(
    'INSERT INTO billing_connections (id,user_id,provider,sealed_key,key_hint,updated_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET sealed_key=excluded.sealed_key,key_hint=excluded.key_hint,updated_at=excluded.updated_at',
    [id, userId, provider, sealed, '•••• ' + key.slice(-4), new Date().toISOString()],
  );
}

export async function removeBillingCredential(userId: string, provider: Provider) {
  await database().query('DELETE FROM billing_connections WHERE id = $1 AND user_id = $2', [
    billingId(userId, provider),
    userId,
  ]);
}

export async function billingConnections(userId: string): Promise<BillingConnection[]> {
  const out: BillingConnection[] = [];
  for (const provider of ['openai', 'anthropic'] as Provider[]) {
    const row = (
      await database().query(
        'SELECT key_hint FROM billing_connections WHERE id = $1 AND user_id = $2',
        [billingId(userId, provider), userId],
      )
    ).rows[0] as Row | undefined;
    const last = (
      await database().query(
        'SELECT * FROM billing_syncs WHERE provider = $1 ORDER BY started_at DESC LIMIT 1',
        [provider],
      )
    ).rows[0] as Row | undefined;
    out.push({
      provider,
      status: row ? 'connected' : 'missing',
      hint: row ? String(row.key_hint) : undefined,
      lastSync: last ? syncFromRow(last) : null,
    });
  }
  return out;
}

export class BillingError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

type CostLine = { day: string; model: string; lineItem: string; usd: number };

/** Read daily billed amounts from a provider's organization cost report (admin key required). */
export async function fetchProviderCosts(
  provider: Provider,
  adminKey: string,
  fromDay: string,
  toDay: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CostLine[]> {
  const lines: CostLine[] = [];
  const start = new Date(fromDay + 'T00:00:00Z');
  const end = new Date(toDay + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 1);
  let page: string | null = null;
  for (let guard = 0; guard < 40; guard++) {
    const url = new URL(
      provider === 'openai'
        ? 'https://api.openai.com/v1/organization/costs'
        : 'https://api.anthropic.com/v1/organizations/cost_report',
    );
    if (provider === 'openai') {
      url.searchParams.set('start_time', String(Math.floor(start.getTime() / 1000)));
      url.searchParams.set('end_time', String(Math.floor(end.getTime() / 1000)));
      url.searchParams.set('bucket_width', '1d');
      url.searchParams.append('group_by[]', 'line_item');
      url.searchParams.set('limit', '31');
    } else {
      url.searchParams.set('starting_at', start.toISOString());
      url.searchParams.set('ending_at', end.toISOString());
      url.searchParams.set('bucket_width', '1d');
      url.searchParams.append('group_by[]', 'description');
      url.searchParams.set('limit', '31');
    }
    if (page) url.searchParams.set('page', page);
    const response = await fetchImpl(url, {
      headers:
        provider === 'openai'
          ? { Authorization: 'Bearer ' + adminKey }
          : { 'x-api-key': adminKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401 || response.status === 403)
      throw new BillingError(
        'The provider rejected this key. Cost reports need an admin-scoped key for an organization account.',
        response.status,
      );
    if (!response.ok)
      throw new BillingError(`The cost report request failed with HTTP ${response.status}.`);
    const body = (await response.json()) as {
      data?: { start_time?: number; starting_at?: string; results?: Row[] }[];
      has_more?: boolean;
      next_page?: string | null;
    };
    for (const bucket of body.data ?? []) {
      const day =
        provider === 'openai'
          ? new Date(num(bucket.start_time) * 1000).toISOString().slice(0, 10)
          : String(bucket.starting_at ?? '').slice(0, 10);
      if (!day) continue;
      for (const r of bucket.results ?? []) {
        if (provider === 'openai') {
          const amount = objectAt(r, 'amount');
          const lineItem = str(r.line_item) ?? '';
          lines.push({
            day,
            model: lineItem.split(',')[0].trim(),
            lineItem,
            usd: Math.max(0, num(amount?.value)),
          });
        } else {
          lines.push({
            day,
            model: str(r.model) ?? '',
            lineItem: str(r.description) ?? '',
            usd: Math.max(0, Number(r.amount ?? 0) / 100),
          });
        }
      }
    }
    if (!body.has_more || !body.next_page) break;
    page = body.next_page;
  }
  return lines;
}

/** Replace the stored billed amounts for one provider over a day range; failures keep old rows. */
export async function syncProviderCosts(
  userId: string,
  provider: Provider,
  days: number,
  fetchImpl: typeof fetch = fetch,
): Promise<BillingSync> {
  const db = database();
  const credential = await billingCredential(userId, provider);
  const toDay = new Date().toISOString().slice(0, 10);
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - Math.max(1, Math.min(180, Math.trunc(days))) + 1);
  const fromDay = from.toISOString().slice(0, 10);
  const started = (
    await db.query(
      "INSERT INTO billing_syncs (provider,from_day,to_day,status) VALUES ($1,$2,$3,'running') RETURNING id",
      [provider, fromDay, toDay],
    )
  ).rows[0] as Row;
  const syncId = Number(started.id);
  try {
    if (!credential) throw new BillingError('Connect an admin key for this provider first.', 409);
    const lines = await fetchProviderCosts(provider, credential.key, fromDay, toDay, fetchImpl);
    const merged = new Map<string, CostLine>();
    for (const l of lines) {
      const k = [l.day, l.model, l.lineItem].join('\u0000');
      const existing = merged.get(k);
      merged.set(k, existing ? { ...existing, usd: existing.usd + l.usd } : l);
    }
    await db.query('DELETE FROM provider_costs WHERE provider = $1 AND day BETWEEN $2 AND $3', [
      provider,
      fromDay,
      toDay,
    ]);
    for (const l of merged.values())
      await db.query(
        'INSERT INTO provider_costs (provider,day,model,line_item,usd,fetched_at) VALUES ($1,$2,$3,$4,$5,now())',
        [provider, l.day, l.model, l.lineItem, Math.round(l.usd * 1e8) / 1e8],
      );
    return syncFromRow(
      (
        await db.query(
          "UPDATE billing_syncs SET status='succeeded', finished_at=now(), rows_upserted=$2 WHERE id=$1 RETURNING *",
          [syncId, merged.size],
        )
      ).rows[0] as Row,
    );
  } catch (e) {
    const message =
      e instanceof Error && e.name === 'TimeoutError'
        ? 'The provider cost report timed out.'
        : e instanceof Error
          ? e.message
          : 'Billing sync failed.';
    return syncFromRow(
      (
        await db.query(
          "UPDATE billing_syncs SET status='failed', finished_at=now(), error=$2 WHERE id=$1 RETURNING *",
          [syncId, message.slice(0, 500)],
        )
      ).rows[0] as Row,
    );
  }
}

/** Estimated ledger spend next to provider-billed spend, per UTC day and provider. */
export async function reconciliation(filters: CostFilters): Promise<Reconciliation> {
  const db = database();
  // Billed reports are whole UTC days, so a partial boundary day is excluded from both sides.
  const dayStart = (v: string, roundUp: boolean) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return undefined;
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    if (roundUp && start.getTime() < d.getTime()) start.setUTCDate(start.getUTCDate() + 1);
    return start.toISOString();
  };
  const from = filters.from ? dayStart(filters.from, true) : undefined;
  const to = filters.to ? dayStart(filters.to, false) : undefined;
  const where = whereFor({ from, to, provider: filters.provider });
  const estimated = (
    await db.query(
      `SELECT to_char(u.created_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS day, u.provider, COALESCE(SUM(u.cost_usd),0) AS usd FROM llm_usage u${where.sql} GROUP BY day, u.provider`,
      where.values,
    )
  ).rows as Row[];
  const billedWhere: string[] = [];
  const billedValues: unknown[] = [];
  if (from) {
    billedValues.push(from.slice(0, 10));
    billedWhere.push('day >= $' + billedValues.length);
  }
  if (to) {
    billedValues.push(to.slice(0, 10));
    billedWhere.push('day < $' + billedValues.length);
  }
  if (filters.provider) {
    billedValues.push(filters.provider);
    billedWhere.push('provider = $' + billedValues.length);
  }
  const billed = (
    await db.query(
      `SELECT to_char(day,'YYYY-MM-DD') AS day, provider, SUM(usd) AS usd FROM provider_costs${billedWhere.length ? ' WHERE ' + billedWhere.join(' AND ') : ''} GROUP BY day, provider`,
      billedValues,
    )
  ).rows as Row[];
  const map = new Map<string, ReconciliationDay>();
  const key = (day: string, provider: string) => day + '|' + provider;
  for (const r of estimated)
    map.set(key(String(r.day), String(r.provider)), {
      day: String(r.day),
      provider: r.provider as Provider,
      estimatedUsd: num(r.usd),
      billedUsd: null,
    });
  for (const r of billed) {
    const k = key(String(r.day), String(r.provider));
    const row = map.get(k) ?? {
      day: String(r.day),
      provider: r.provider as Provider,
      estimatedUsd: 0,
      billedUsd: null,
    };
    row.billedUsd = num(r.usd);
    map.set(k, row);
  }
  const days = [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  const byProvider = (['openai', 'anthropic'] as Provider[])
    .map((provider) => {
      const rows = days.filter((d) => d.provider === provider);
      const covered = rows.filter((d) => d.billedUsd != null);
      return {
        provider,
        estimatedUsd: covered.reduce((s, d) => s + d.estimatedUsd, 0),
        billedUsd: covered.length ? covered.reduce((s, d) => s + (d.billedUsd ?? 0), 0) : null,
        coveredDays: covered.length,
      };
    })
    .filter((p) => days.some((d) => d.provider === p.provider));
  return { days, byProvider };
}
