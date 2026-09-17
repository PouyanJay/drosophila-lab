'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RefreshCw, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  formatUsd,
  type BillingConnection,
  type CostBucket,
  type CostSummary,
  type ModelPrice,
  type PricingRefresh,
  type SpendAlert,
} from '@/lib/contracts/costs';
import { modelName, providerName, type Provider } from '@/lib/contracts/providers';
import './costs.css';

const SERIES: Record<Provider, string> = { anthropic: '#66a834', openai: '#4585d0' };
const RANGES = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: 0 },
] as const;
type RangeId = (typeof RANGES)[number]['id'];
type Filters = {
  range: RangeId;
  provider?: Provider;
  model?: string;
  keyHint?: string;
  surface?: string;
  experimentId?: string;
};
type Tab = 'overview' | 'calls' | 'billing' | 'pricing' | 'alerts';
const tokens = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
const when = (iso: string) => new Date(iso).toLocaleString();

function query(f: Filters) {
  const p = new URLSearchParams();
  const range = RANGES.find((r) => r.id === f.range);
  if (range?.days) p.set('since', new Date(Date.now() - range.days * 86400000).toISOString());
  if (f.provider) p.set('provider', f.provider);
  if (f.model) p.set('model', f.model);
  if (f.keyHint) p.set('key', f.keyHint);
  if (f.surface) p.set('surface', f.surface);
  if (f.experimentId) p.set('experiment', f.experimentId);
  return p.toString();
}

type BodyProps = {
  experimentId?: string | null;
  experimentName?: string;
  alerts: SpendAlert[];
  onAcknowledge: (id: number) => void;
};

/** Spending, pricing, and alert management for paid model calls. */
export default function CostDashboard({
  open,
  onClose,
  ...body
}: BodyProps & { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="da-dialog cd-dialog">
        <DialogTitle>Spending</DialogTitle>
        <DialogDescription>
          Every paid OpenAI and Claude call is priced with the rates stored locally at the time of
          the call. Totals are estimates until reconciled with provider invoices.
        </DialogDescription>
        {open && <DashboardBody key={body.experimentId ?? ''} {...body} />}
      </DialogContent>
    </Dialog>
  );
}

function DashboardBody({ experimentId, experimentName, alerts, onAcknowledge }: BodyProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [filters, setFilters] = useState<Filters>(() =>
    experimentId ? { range: 'all', experimentId } : { range: '30d' },
  );
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState<{
    prices: ModelPrice[];
    refreshes: PricingRefresh[];
    sourceUrl: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pricingMessage, setPricingMessage] = useState('');
  const [history, setHistory] = useState<SpendAlert[]>([]);
  const [stepUsd, setStepUsd] = useState('50');
  const [stepMessage, setStepMessage] = useState('');
  const [billing, setBilling] = useState<BillingConnection[]>([]);
  const [billingKeys, setBillingKeys] = useState<Record<string, string>>({});
  const [billingBusy, setBillingBusy] = useState<string>('');
  const [billingMessage, setBillingMessage] = useState('');
  const [billingError, setBillingError] = useState('');
  const [billingLoadError, setBillingLoadError] = useState('');
  const loadBilling = useCallback(async () => {
    try {
      const r = await fetch('/api/costs/billing');
      if (!r.ok) throw Error('Billing connections could not load.');
      const d = (await r.json()) as { connections: BillingConnection[] };
      setBilling(d.connections);
      setBillingLoadError('');
    } catch (e) {
      setBillingLoadError(e instanceof Error ? e.message : 'Billing connections could not load.');
    }
  }, []);
  async function billingMutate(provider: Provider, remove: boolean) {
    setBillingBusy(provider);
    setBillingMessage('');
    setBillingError('');
    try {
      const r = await fetch('/api/costs/billing', {
        method: remove ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: billingKeys[provider] ?? '' }),
      });
      const d = (await r.json()) as { connections?: BillingConnection[]; error?: string };
      if (!r.ok) throw Error(d.error || 'The billing connection could not be saved.');
      if (d.connections) setBilling(d.connections);
      else await loadBilling();
      setBillingKeys((k) => ({ ...k, [provider]: '' }));
      setBillingMessage(
        remove
          ? `${providerName(provider)} admin key removed.`
          : `${providerName(provider)} cost reports connected.`,
      );
    } catch (e) {
      setBillingError(e instanceof Error ? e.message : 'The billing connection failed.');
    } finally {
      setBillingBusy('');
    }
  }
  async function syncBilling() {
    setBillingBusy('sync');
    setBillingMessage('');
    setBillingError('');
    try {
      const r = await fetch('/api/costs/billing/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 30 }),
      });
      const d = (await r.json()) as {
        syncs?: {
          provider: Provider;
          status: string;
          rowsUpserted: number;
          error: string | null;
        }[];
        connections?: BillingConnection[];
        error?: string;
      };
      if (d.connections) setBilling(d.connections);
      if (!d.syncs) throw Error(d.error || 'Billing sync failed.');
      setBillingMessage(
        d.syncs
          .map((x) =>
            x.status === 'succeeded'
              ? `${providerName(x.provider)}: ${x.rowsUpserted} billed line items for the last 30 days.`
              : `${providerName(x.provider)}: ${x.error || 'sync failed'}`,
          )
          .join(' '),
      );
      void load(filters);
    } catch (e) {
      setBillingError(e instanceof Error ? e.message : 'Billing sync failed.');
    } finally {
      setBillingBusy('');
    }
  }

  const requestId = useRef(0);
  const load = useCallback(async (f: Filters) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const r = await fetch('/api/costs?' + query(f));
      const d = (await r.json()) as CostSummary & { error?: string };
      if (id !== requestId.current) return;
      if (!r.ok) throw Error(d.error || 'Spending is unavailable.');
      setSummary(d);
      setError('');
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : 'Spending is unavailable.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);
  const [pricingError, setPricingError] = useState('');
  const loadPricing = useCallback(async () => {
    try {
      const r = await fetch('/api/costs/prices');
      if (!r.ok) throw Error('Pricing is unavailable.');
      setPricing(await r.json());
      setPricingError('');
    } catch (e) {
      setPricingError(e instanceof Error ? e.message : 'Pricing is unavailable.');
    }
  }, []);
  const loadAlerts = useCallback(async () => {
    try {
      const r = await fetch('/api/costs/alerts');
      if (!r.ok) return;
      const d = (await r.json()) as { alerts: SpendAlert[]; stepUsd: number };
      setHistory(d.alerts);
      setStepUsd(String(d.stepUsd));
    } catch {
      // The alerts list stays as previously loaded.
    }
  }, []);

  const [initialFilters] = useState(filters);
  useEffect(() => {
    // Defer the first fetches past the commit so no state is set synchronously in the effect.
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      void load(initialFilters);
      void loadPricing();
      void loadAlerts();
      void loadBilling();
    });
    return () => {
      active = false;
    };
  }, [initialFilters, load, loadPricing, loadAlerts, loadBilling]);

  function apply(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    void load(next);
  }
  function toggle<K extends keyof Filters>(key: K, value: Filters[K]) {
    apply({ [key]: filters[key] === value ? undefined : value } as Partial<Filters>);
  }
  async function refreshPrices() {
    setRefreshing(true);
    setPricingMessage('');
    try {
      const r = await fetch('/api/costs/prices', { method: 'POST' });
      const d = (await r.json()) as {
        refresh?: PricingRefresh;
        prices?: ModelPrice[];
        refreshes?: PricingRefresh[];
        error?: string;
      };
      const prices = d.prices,
        refreshes = d.refreshes;
      if (prices && refreshes) {
        setPricing((p) => ({ sourceUrl: p?.sourceUrl ?? '', prices, refreshes }));
        setPricingError('');
      }
      if (d.refresh?.status === 'succeeded')
        setPricingMessage(`Updated ${d.refresh.modelsUpdated} model prices.`);
      else
        setPricingMessage(
          d.refresh?.error || d.error || 'Refresh failed. Existing prices are unchanged.',
        );
    } catch {
      setPricingMessage('Refresh failed. Existing prices are unchanged.');
    } finally {
      setRefreshing(false);
    }
  }
  async function saveStep() {
    setStepMessage('');
    try {
      const r = await fetch('/api/costs/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepUsd: Number(stepUsd) }),
      });
      const d = (await r.json()) as { stepUsd?: number; error?: string };
      setStepMessage(
        r.ok ? `Alerts fire every ${formatUsd(d.stepUsd ?? 0)} of spend.` : d.error || 'Not saved.',
      );
    } catch {
      setStepMessage('The alert step could not be saved. Check that the workspace is running.');
    }
  }

  const active = useMemo(
    () =>
      (
        [
          ['provider', filters.provider && providerName(filters.provider)],
          ['model', filters.model],
          ['keyHint', filters.keyHint && 'Key ' + filters.keyHint],
          ['surface', filters.surface],
          ['experimentId', filters.experimentId && (experimentName || 'This experiment')],
        ] as [keyof Filters, string | undefined][]
      ).filter((x): x is [keyof Filters, string] => !!x[1]),
    [filters, experimentName],
  );
  const chart = useMemo(
    () =>
      (summary?.byDay ?? []).map((d) => ({
        ...d,
        label: d.day.slice(5),
        total: d.openai + d.anthropic,
      })),
    [summary],
  );
  const unacknowledged = alerts.length;

  return (
    <>
      <nav className="cd-tabs" aria-label="Spending sections">
        {(
          [
            ['overview', 'Overview'],
            ['calls', 'Calls'],
            ['billing', 'Billing'],
            ['pricing', 'Pricing'],
            ['alerts', unacknowledged ? `Alerts (${unacknowledged})` : 'Alerts'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab !== 'pricing' && tab !== 'alerts' && (
        <div className="cd-filters" role="group" aria-label="Filters">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={filters.range === r.id}
              className={'cd-chip ' + (filters.range === r.id ? 'active' : '')}
              onClick={() => apply({ range: r.id })}
            >
              {r.label}
            </button>
          ))}
          {(tab === 'billing' ? [] : active).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="cd-chip active cd-chip-remove"
              aria-label={'Remove filter ' + label}
              onClick={() => apply({ [key]: undefined } as Partial<Filters>)}
            >
              {label} <X size={12} />
            </button>
          ))}
          {loading && <span className="cd-status">Loading…</span>}
        </div>
      )}
      {error && (
        <p className="cd-error" role="alert">
          {error}{' '}
          <button type="button" onClick={() => load(filters)}>
            Retry
          </button>
        </p>
      )}
      {tab === 'overview' && summary && (
        <div className="cd-body">
          <div className="cd-tiles">
            <Tile label="Spent in range" value={formatUsd(summary.totals.usd)} />
            <Tile label="Lifetime" value={formatUsd(summary.lifetimeUsd)} />
            <Tile label="Calls" value={String(summary.totals.calls)} />
            <Tile
              label="Tokens in / out"
              value={
                tokens(summary.totals.inputTokens + summary.totals.cacheReadTokens) +
                ' / ' +
                tokens(summary.totals.outputTokens)
              }
            />
            {summary.reconciliation.byProvider.some((p) => p.billedUsd != null) && (
              <Tile
                label="Billed by providers"
                value={formatUsd(
                  summary.reconciliation.byProvider.reduce((t, p) => t + (p.billedUsd ?? 0), 0),
                )}
                hint={
                  'Estimated ' +
                  formatUsd(
                    summary.reconciliation.byProvider.reduce((t, p) => t + p.estimatedUsd, 0),
                  ) +
                  ' across the whole ledger on those days. See Billing.'
                }
              />
            )}
            {summary.totals.unpriced > 0 && (
              <Tile
                label="Unpriced calls"
                value={String(summary.totals.unpriced)}
                hint="No stored rate for the model. Refresh pricing."
              />
            )}
          </div>
          <section className="cd-chart" aria-label="Daily spend by provider">
            <header>
              <h3>Daily spend</h3>
              <span className="cd-legend">
                <i style={{ background: SERIES.anthropic }} /> Claude
                <i style={{ background: SERIES.openai }} /> OpenAI
              </span>
            </header>
            {chart.length ? (
              <div className="cd-chart-area">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#25303b" />
                    <XAxis dataKey="label" stroke="#8a99a8" tick={{ fontSize: 11 }} />
                    <YAxis
                      width={56}
                      stroke="#8a99a8"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => formatUsd(v)}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{
                        background: '#16202a',
                        border: '1px solid #344250',
                        borderRadius: 12,
                        color: '#f4f7fa',
                      }}
                      formatter={(value, name) => [
                        formatUsd(Number(value ?? 0), true),
                        name === 'openai' ? 'OpenAI' : 'Claude',
                      ]}
                    />
                    <Bar
                      dataKey="anthropic"
                      stackId="usd"
                      fill={SERIES.anthropic}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="openai"
                      stackId="usd"
                      fill={SERIES.openai}
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="cd-empty">No paid calls in this range.</p>
            )}
            {chart.length > 0 && (
              <details className="cd-table-view">
                <summary>Table view</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Claude</th>
                      <th>OpenAI</th>
                      <th>Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chart.map((d) => (
                      <tr key={d.day}>
                        <td>{d.day}</td>
                        <td>{formatUsd(d.anthropic, true)}</td>
                        <td>{formatUsd(d.openai, true)}</td>
                        <td>{d.calls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </section>
          <div className="cd-breakdowns">
            <Breakdown
              title="By experiment"
              rows={summary.byExperiment}
              selected={filters.experimentId}
              onSelect={(b) => toggle('experimentId', b.key || undefined)}
            />
            <Breakdown
              title="By model"
              rows={summary.byModel}
              selected={filters.model}
              onSelect={(b) => toggle('model', b.label)}
            />
            <Breakdown
              title="By API key"
              rows={summary.byKey}
              selected={filters.keyHint}
              onSelect={(b) => toggle('keyHint', b.key)}
            />
            <Breakdown
              title="By provider"
              rows={summary.byProvider}
              selected={filters.provider}
              onSelect={(b) => toggle('provider', b.key as Provider)}
            />
            <Breakdown
              title="By surface"
              rows={summary.bySurface}
              selected={filters.surface}
              onSelect={(b) => toggle('surface', b.key)}
            />
          </div>
        </div>
      )}
      {tab === 'calls' && summary && (
        <div className="cd-body">
          {summary.recent.length ? (
            <table className="cd-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Model</th>
                  <th>Key</th>
                  <th>Surface</th>
                  <th>In</th>
                  <th>Cached</th>
                  <th>Out</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {summary.recent.map((r) => (
                  <tr key={r.id}>
                    <td>{when(r.createdAt)}</td>
                    <td>
                      {modelName(r.model)}
                      <small>
                        {r.model}
                        {r.serviceTier !== 'standard'
                          ? ' · ' +
                            r.serviceTier +
                            (r.tierRateExact === false ? ' (standard rate used)' : '')
                          : ''}
                      </small>
                    </td>
                    <td>
                      {r.keyHint}
                      <small>{r.credentialSource}</small>
                    </td>
                    <td>{r.surface}</td>
                    <td>{tokens(r.inputTokens)}</td>
                    <td>{tokens(r.cacheReadTokens + r.cacheWriteTokens)}</td>
                    <td>{tokens(r.outputTokens)}</td>
                    <td>{r.usd == null ? 'unpriced' : formatUsd(r.usd, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="cd-empty">No paid calls match these filters.</p>
          )}
          <p className="cd-note">Most recent 50 calls. Narrow the filters to see older calls.</p>
        </div>
      )}
      {tab === 'pricing' && (
        <div className="cd-body">
          <div className="cd-pricing-head">
            <p>
              Rates are USD per million tokens. Refresh pulls the community-maintained LiteLLM price
              list, which cites the official OpenAI and Claude pricing pages, and updates every
              supported model. Past calls keep the rates they were priced with.
            </p>
            <button
              type="button"
              className="cd-primary"
              disabled={refreshing}
              onClick={refreshPrices}
            >
              <RefreshCw size={14} className={refreshing ? 'cd-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh prices online'}
            </button>
          </div>
          {pricingMessage && (
            <p className="cd-status" role="status">
              {pricingMessage}
            </p>
          )}
          {pricing?.refreshes[0] && (
            <p className="cd-note">
              Last refresh {when(pricing.refreshes[0].startedAt)}: {pricing.refreshes[0].status}
              {pricing.refreshes[0].error ? ' (' + pricing.refreshes[0].error + ')' : ''}.
            </p>
          )}
          {pricing ? (
            <table className="cd-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Cache read</th>
                  <th>Cache write</th>
                  <th>Other tiers</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {pricing.prices.map((p) => (
                  <tr key={p.provider + p.model}>
                    <td>{providerName(p.provider)}</td>
                    <td>{p.model}</td>
                    <td>{formatUsd(p.input)}</td>
                    <td>{formatUsd(p.output)}</td>
                    <td>{p.cacheRead == null ? '—' : formatUsd(p.cacheRead)}</td>
                    <td>{p.cacheWrite == null ? '—' : formatUsd(p.cacheWrite)}</td>
                    <td>
                      {[
                        p.inputFlex != null &&
                          `flex ${formatUsd(p.inputFlex)}/${formatUsd(p.outputFlex)}`,
                        p.inputPriority != null &&
                          `priority ${formatUsd(p.inputPriority)}/${formatUsd(p.outputPriority)}`,
                        p.cacheWrite1h != null && `1h cache ${formatUsd(p.cacheWrite1h)}`,
                        p.fastMultiplier != null && `fast ×${p.fastMultiplier}`,
                      ]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>
                    <td>
                      {p.sourceUrl ? (
                        <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                          {p.source}
                        </a>
                      ) : (
                        p.source
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : pricingError ? (
            <p className="cd-error" role="alert">
              {pricingError}{' '}
              <button type="button" onClick={() => loadPricing()}>
                Retry
              </button>
            </p>
          ) : (
            <p className="cd-empty">Pricing is loading…</p>
          )}
        </div>
      )}
      {tab === 'billing' && (
        <div className="cd-body">
          <p className="cd-note">
            Connect an admin-scoped key to pull what each provider actually billed, then compare it
            with the ledger&apos;s estimates. OpenAI needs an organization admin key; Claude needs
            an Admin API key, which is available for Console organizations but not individual
            accounts. Billed amounts cover the whole organization, not only this lab, so a positive
            difference can mean other usage on the same account.
          </p>
          {billingLoadError && (
            <p className="cd-error" role="alert">
              {billingLoadError}{' '}
              <button type="button" onClick={() => loadBilling()}>
                Retry
              </button>
            </p>
          )}

          <div className="cd-billing-grid">
            {(['anthropic', 'openai'] as Provider[]).map((provider) => {
              const c = billing.find((x) => x.provider === provider);
              return (
                <form
                  key={provider}
                  className="cd-billing-card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void billingMutate(provider, false);
                  }}
                >
                  <h3>{providerName(provider)} cost reports</h3>
                  <p className="cd-status">
                    {c?.status === 'connected'
                      ? `Connected (${c.hint}). ` +
                        (c.lastSync
                          ? `Last sync ${when(c.lastSync.startedAt)}: ${c.lastSync.status}` +
                            (c.lastSync.error ? ` (${c.lastSync.error})` : '') +
                            '.'
                          : 'Not synced yet.')
                      : 'Not connected.'}
                  </p>
                  <label>
                    Admin API key
                    <input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={billingKeys[provider] ?? ''}
                      placeholder={provider === 'anthropic' ? 'sk-ant-admin…' : 'sk-admin…'}
                      onChange={(e) =>
                        setBillingKeys((k) => ({ ...k, [provider]: e.target.value }))
                      }
                      disabled={!!billingBusy}
                      maxLength={2048}
                    />
                  </label>
                  <div className="cd-billing-actions">
                    <button
                      type="submit"
                      className="cd-primary"
                      disabled={!!billingBusy || !(billingKeys[provider] ?? '').trim()}
                    >
                      {billingBusy === provider
                        ? 'Verifying…'
                        : c?.status === 'connected'
                          ? 'Verify & replace key'
                          : 'Verify & connect'}
                    </button>
                    {c?.status === 'connected' && (
                      <button
                        type="button"
                        disabled={!!billingBusy}
                        onClick={() => billingMutate(provider, true)}
                      >
                        Remove key
                      </button>
                    )}
                  </div>
                  <small className="cd-note">
                    Encrypted on the server, used only to read cost reports, never for model calls.
                    {provider === 'anthropic'
                      ? ' Created at Console › Settings › Admin keys, which only exists for organization accounts; an individual account gets "Page not found" there and cannot use cost reports.'
                      : ' Created at OpenAI › Organization settings › Admin keys by an organization owner.'}
                  </small>
                </form>
              );
            })}
          </div>
          <div className="cd-billing-actions">
            <button
              type="button"
              className="cd-primary"
              disabled={!!billingBusy || !billing.some((c) => c.status === 'connected')}
              onClick={syncBilling}
            >
              <RefreshCw size={14} className={billingBusy === 'sync' ? 'cd-spin' : ''} />
              {billingBusy === 'sync' ? 'Syncing…' : 'Sync last 30 days'}
            </button>
            <span className="cd-status" role="status">
              {billingMessage}
            </span>
            <span className="cd-error" role="alert">
              {billingError}
            </span>
          </div>
          {summary && summary.reconciliation.days.length ? (
            <table className="cd-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Provider</th>
                  <th>Estimated</th>
                  <th>Billed</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {summary.reconciliation.days.map((d) => (
                  <tr key={d.day + d.provider}>
                    <td>{d.day}</td>
                    <td>{providerName(d.provider)}</td>
                    <td>{formatUsd(d.estimatedUsd, true)}</td>
                    <td>{d.billedUsd == null ? 'not synced' : formatUsd(d.billedUsd, true)}</td>
                    <td>
                      {d.billedUsd == null ? '—' : formatUsd(d.billedUsd - d.estimatedUsd, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="cd-empty">
              No days to compare in this range. Days appear once the ledger has calls or a sync has
              stored billed amounts.
            </p>
          )}
        </div>
      )}
      {tab === 'alerts' && (
        <div className="cd-body">
          <form
            className="cd-step"
            onSubmit={(e) => {
              e.preventDefault();
              void saveStep();
            }}
          >
            <label>
              Alert every
              <input
                type="number"
                min={1}
                step={1}
                value={stepUsd}
                onChange={(e) => setStepUsd(e.target.value)}
              />
              USD of lifetime spend
            </label>
            <button type="submit" className="cd-primary">
              Save
            </button>
            {stepMessage && <span className="cd-status">{stepMessage}</span>}
          </form>
          {history.length ? (
            <ul className="cd-alerts">
              {history.map((a) => (
                <li key={a.id} className={a.acknowledgedAt ? 'done' : ''}>
                  <span>
                    Spend passed {formatUsd(a.thresholdUsd)} at {formatUsd(a.totalUsd)} on{' '}
                    {when(a.triggeredAt)}
                  </span>
                  {a.acknowledgedAt ? (
                    <small>Acknowledged</small>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onAcknowledge(a.id);
                        setHistory((h) =>
                          h.map((x) =>
                            x.id === a.id ? { ...x, acknowledgedAt: new Date().toISOString() } : x,
                          ),
                        );
                      }}
                    >
                      Acknowledge
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="cd-empty">No spend alerts yet.</p>
          )}
        </div>
      )}
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="cd-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  selected,
  onSelect,
}: {
  title: string;
  rows: CostBucket[];
  selected?: string;
  onSelect: (b: CostBucket) => void;
}) {
  const max = Math.max(0, ...rows.map((r) => r.usd));
  return (
    <section className="cd-breakdown">
      <h3>{title}</h3>
      {rows.length ? (
        <ul>
          {rows.slice(0, 12).map((b) => {
            const isSelected = selected != null && (selected === b.key || selected === b.label);
            return (
              <li key={b.key || b.label}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  title={`${b.calls} calls · ${tokens(b.inputTokens + b.cacheReadTokens)} in · ${tokens(b.outputTokens)} out${b.unpriced ? ` · ${b.unpriced} unpriced` : ''}`}
                  onClick={() => onSelect(b)}
                >
                  <span className="cd-bar-label">{b.label}</span>
                  <span className="cd-bar-track">
                    <i style={{ width: max ? (100 * b.usd) / max + '%' : '0%' }} />
                  </span>
                  <span className="cd-bar-value">
                    {formatUsd(b.usd)}
                    {b.unpriced ? '*' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="cd-empty">Nothing yet.</p>
      )}
    </section>
  );
}
