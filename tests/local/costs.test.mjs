import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModuleLoader } from '../helpers/load-typescript.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = mkdtempSync(path.join(tmpdir(), 'drosophila-costs-'));
const pg = await PGlite.create(directory);
await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
for (const file of [
  '20260915000000_local_workspace.sql',
  '20260916000000_llm_costs.sql',
  '20260917000000_llm_cost_reconciliation.sql',
])
  await pg.exec(readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
await pg.exec('SET search_path=lab,public');
class Pool {
  on() {}
  query(sql, values) {
    return pg.query(sql, values);
  }
}
process.env.DATABASE_URL = 'postgresql://local-test';
process.env.LOCAL_WORKSPACE = '1';
process.env.OPENAI_API_KEY = 'sk-test-site-key-0000000000000000';
process.env.PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const load = createModuleLoader({ pg: { Pool } });
const costs = await load('@/server/llm-costs');
const contract = await load('@/lib/contracts/costs');
const guideRoute = await load('@/app/api/guide/route');
const discoveryRoute = await load('@/app/api/discovery/guide/route');
const { defaultDiscovery } = await load('@/lib/contracts/discovery-contract');
const costsRoute = await load('@/app/api/costs/route');
const pricesRoute = await load('@/app/api/costs/prices/route');
const alertsRoute = await load('@/app/api/costs/alerts/route');
const billingRoute = await load('@/app/api/costs/billing/route');
const billingSyncRoute = await load('@/app/api/costs/billing/sync/route');
const providersRoute = await load('@/app/api/providers/route');
const usage = (over = {}) => ({
  input: 1000,
  output: 500,
  cacheRead: 0,
  cacheWrite: 0,
  cacheWrite1h: 0,
  reasoning: 0,
  serviceTier: 'standard',
  requestId: null,
  ...over,
});
const entry = (over = {}) => ({
  userId: 'local-workspace',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  credentialSource: 'personal',
  keyHint: '•••• ab12',
  surface: 'guide',
  experimentId: 'session-a',
  usage: usage(),
  ...over,
});
const originalFetch = globalThis.fetch;
after(async () => {
  globalThis.fetch = originalFetch;
  await pg.close();
  rmSync(directory, { recursive: true, force: true });
});

test('provider usage blocks normalize to billable token classes', () => {
  assert.deepEqual(
    costs.usageFromResponse('openai', {
      id: 'resp_1',
      usage: {
        input_tokens: 1200,
        input_tokens_details: { cached_tokens: 200 },
        output_tokens: 300,
        output_tokens_details: { reasoning_tokens: 100 },
      },
    }),
    {
      input: 1000,
      output: 300,
      cacheRead: 200,
      cacheWrite: 0,
      cacheWrite1h: 0,
      reasoning: 100,
      serviceTier: 'standard',
      requestId: 'resp_1',
    },
  );
  assert.deepEqual(
    costs.usageFromResponse('anthropic', {
      id: 'msg_1',
      usage: {
        input_tokens: 50,
        output_tokens: 20,
        cache_read_input_tokens: 400,
        cache_creation_input_tokens: 100,
      },
    }),
    {
      input: 50,
      output: 20,
      cacheRead: 400,
      cacheWrite: 100,
      cacheWrite1h: 0,
      reasoning: 0,
      serviceTier: 'standard',
      requestId: 'msg_1',
    },
  );
  assert.deepEqual(costs.usageFromResponse('openai', {}), usage({ input: 0, output: 0 }));
});

test('cost formula applies input, output, and cache rates per million tokens', () => {
  const rates = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };
  assert.equal(
    contract.costFor(
      rates,
      usage({ input: 1_000_000, output: 100_000, cacheRead: 500_000, cacheWrite: 200_000 }),
    ),
    2 + 1 + 0.1 + 0.5,
  );
  assert.equal(
    contract.costFor(
      { input: 2, output: 10, cacheRead: null, cacheWrite: null },
      usage({ cacheRead: 1000 }),
    ),
    (1000 * 2 + 500 * 10 + 1000 * 2) / 1e6,
  );
  assert.deepEqual(contract.priceLookupIds('gpt-5-2025-08-07'), ['gpt-5-2025-08-07', 'gpt-5']);
  assert.deepEqual(contract.priceLookupIds('claude-sonnet-4-5-20250929'), [
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-5',
  ]);
});

test('recorded calls are priced from the seeded table and keep the rates used', async () => {
  const recorded = await costs.recordUsage(entry());
  assert.equal(recorded.priced, true);
  assert.equal(recorded.usd, (1000 * 2 + 500 * 10) / 1e6);
  const row = (await pg.query('SELECT * FROM llm_usage WHERE id=$1', [recorded.id])).rows[0];
  assert.equal(row.experiment_id, 'session-a');
  assert.equal(row.key_hint, '•••• ab12');
  assert.equal(JSON.parse(row.rates).priceModel, 'claude-sonnet-5');
  const dated = await costs.recordUsage(
    entry({ provider: 'openai', model: 'gpt-5-2025-08-07', usage: usage({ cacheRead: 1000 }) }),
  );
  assert.equal(dated.priced, true);
  assert.equal(dated.usd, (1000 * 1.25 + 500 * 10 + 1000 * 0.125) / 1e6);
  const unknown = await costs.recordUsage(
    entry({ model: 'claude-unreleased-9', experimentId: 'session-b' }),
  );
  assert.equal(unknown.priced, false);
  assert.equal(unknown.usd, null);
  assert.equal(unknown.alerts.length, 0);
});

test('summary breaks spend down and honors drill-through filters', async () => {
  await pg.query(
    "INSERT INTO lab_records (id,kind,name,created_at,payload) VALUES ('session-a','agent-session','Cue memory','2026-09-15','{}')",
  );
  const all = await costs.costSummary({});
  assert.equal(all.totals.calls, 3);
  assert.equal(all.totals.unpriced, 1);
  assert.ok(
    all.byExperiment.some(
      (b) => b.key === 'session-a' && b.label === 'Cue memory' && b.calls === 2,
    ),
  );
  assert.ok(
    all.byExperiment.some((b) => b.key === 'session-b' && b.label.startsWith('Unsaved experiment')),
  );
  assert.equal(all.byProvider.length, 2);
  assert.ok(all.byKey[0].label.includes('•••• ab12'));
  const onlyA = await costs.costSummary({ experimentId: 'session-a', provider: 'anthropic' });
  assert.equal(onlyA.totals.calls, 1);
  assert.equal(onlyA.byModel[0].label, 'claude-sonnet-5');
  assert.equal(onlyA.byDay.length, 1);
  assert.equal(onlyA.recent.length, 1);
  const response = await costsRoute.GET(
    new Request(
      'http://localhost:3000/api/costs?experiment=session-a&provider=bogus&since=not-a-date',
    ),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.totals.calls, 2);
  assert.deepEqual(body.filters, { experimentId: 'session-a' });
  const dated = await (
    await costsRoute.GET(new Request('http://localhost:3000/api/costs?since=2026-09-01'))
  ).json();
  assert.equal(dated.filters.from, '2026-09-01T00:00:00.000Z');
});

test('every crossed step raises exactly one alert and later calls do not repeat it', async () => {
  await costs.setAlertStep(1);
  // ~$2.60 in one call crosses $1 and $2 at once
  const big = await costs.recordUsage(
    entry({ model: 'claude-opus-5', usage: usage({ input: 100_000, output: 80_000 }) }),
  );
  assert.deepEqual(
    big.alerts.map((a) => a.thresholdUsd),
    [1, 2],
  );
  const again = await costs.recordUsage(entry());
  assert.equal(again.alerts.length, 0);
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM spend_alerts')).rows[0].n, 2);
  const listed = await alertsRoute.GET();
  const { alerts, stepUsd } = await listed.json();
  assert.equal(stepUsd, 1);
  assert.equal(alerts[0].acknowledgedAt, null);
  const ack = await alertsRoute.POST(
    new Request('http://localhost:3000/api/costs/alerts', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
      body: JSON.stringify({ id: alerts[0].id }),
    }),
  );
  assert.deepEqual(await ack.json(), { acknowledged: true });
  assert.equal(
    await (
      await alertsRoute.POST(
        new Request('http://localhost:3000/api/costs/alerts', {
          method: 'POST',
          headers: { origin: 'http://evil.test' },
          body: '{}',
        }),
      )
    ).status,
    403,
  );
  const rejected = await alertsRoute.PATCH(
    new Request('http://localhost:3000/api/costs/alerts', {
      method: 'PATCH',
      headers: { origin: 'http://localhost:3000' },
      body: JSON.stringify({ stepUsd: 0 }),
    }),
  );
  assert.equal(rejected.status, 400);
  await costs.setAlertStep(50);
});

test('price refresh updates rows from the online list and a failed refresh leaves prices intact', async () => {
  const before = await costs.resolvePrice('anthropic', 'claude-sonnet-5');
  try {
    globalThis.fetch = async () =>
      Response.json({
        'claude-sonnet-5': {
          litellm_provider: 'anthropic',
          mode: 'chat',
          input_cost_per_token: 0.000003,
          output_cost_per_token: 0.000015,
          cache_read_input_token_cost: 3e-7,
          cache_creation_input_token_cost: 0.00000375,
          source: 'https://platform.claude.com/docs/en/about-claude/pricing',
        },
        'gpt-7': {
          litellm_provider: 'openai',
          mode: 'chat',
          input_cost_per_token: 0.000001,
          output_cost_per_token: 0.000004,
        },
        'gpt-7-audio': {
          litellm_provider: 'openai',
          mode: 'chat',
          input_cost_per_token: 1,
          output_cost_per_token: 1,
        },
        'text-embedding-9': {
          litellm_provider: 'openai',
          mode: 'embedding',
          input_cost_per_token: 1,
        },
        'gemini-9': {
          litellm_provider: 'gemini',
          mode: 'chat',
          input_cost_per_token: 1,
          output_cost_per_token: 1,
        },
      });
    const ok = await costs.refreshPrices();
    assert.equal(ok.status, 'succeeded');
    assert.equal(ok.modelsUpdated, 2);
    const after = await costs.resolvePrice('anthropic', 'claude-sonnet-5');
    assert.equal(before.input, 2);
    assert.equal(after.input, 3);
    assert.equal(after.cacheWrite, 3.75);
    assert.equal((await costs.resolvePrice('openai', 'gpt-7')).output, 4);
    assert.equal(await costs.resolvePrice('openai', 'gpt-7-audio'), null);
    globalThis.fetch = async () => new Response('down', { status: 500 });
    const failed = await costs.refreshPrices();
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /HTTP 500/);
    assert.equal((await costs.resolvePrice('anthropic', 'claude-sonnet-5')).input, 3);
    globalThis.fetch = async () => Response.json({ nothing: { mode: 'chat' } });
    assert.equal((await costs.refreshPrices()).status, 'failed');
    const viaRoute = await pricesRoute.POST(
      new Request('http://localhost:3000/api/costs/prices', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
      }),
    );
    assert.equal(viaRoute.status, 502);
    const listed = await (await pricesRoute.GET()).json();
    assert.equal(listed.refreshes.length, 4);
    assert.ok(listed.prices.length > 50);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the guide route records a priced call for the conversation it served', async () => {
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/v1/models'))
        return Response.json({ data: [{ id: 'gpt-5', created: 1 }] });
      return Response.json({
        id: 'resp_guide',
        status: 'completed',
        model: 'gpt-5-2025-08-07',
        usage: {
          input_tokens: 4000,
          input_tokens_details: { cached_tokens: 1000 },
          output_tokens: 200,
        },
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  text: 'Which task?',
                  stage: 1,
                  plan: {
                    task: '',
                    goal: '',
                    duplicates: 32,
                    prune: 0,
                    memory: false,
                    population: 'cb_intrinsic',
                    seeds: 3,
                    epochs: 12,
                    seed: 41,
                    budget: 'quick',
                  },
                }),
              },
            ],
          },
        ],
      });
    };
    const response = await guideRoute.POST(
      new Request('http://localhost:3000/api/guide', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Help the fly remember a cue',
          stage: 0,
          plan: {
            task: '',
            goal: '',
            duplicates: 32,
            prune: 0,
            memory: false,
            population: 'cb_intrinsic',
            seeds: 3,
            epochs: 12,
            seed: 41,
            budget: 'quick',
          },
          messages: [],
          provider: 'openai',
          model: 'gpt-5',
          sessionId: 'session-guide',
          execution: 'browser',
        }),
      }),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.cost.recorded, true);
    assert.equal(body.cost.priced, true);
    assert.equal(body.cost.usd, (3000 * 1.25 + 200 * 10 + 1000 * 0.125) / 1e6);
    const row = (await pg.query("SELECT * FROM llm_usage WHERE experiment_id='session-guide'"))
      .rows[0];
    assert.equal(row.model, 'gpt-5-2025-08-07');
    assert.equal(row.credential_source, 'site');
    assert.equal(row.surface, 'guide');
    assert.equal(row.cache_read_tokens, 1000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the discovery guide records the campaign and the provider-reported model', async () => {
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/v1/models'))
        return Response.json({ data: [{ id: 'claude-sonnet-5', created_at: '2026-01-01' }] });
      return Response.json({
        id: 'msg_discovery',
        stop_reason: 'end_turn',
        model: 'claude-sonnet-5',
        usage: {
          input_tokens: 700,
          output_tokens: 300,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              text: 'Ready to review.',
              config: defaultDiscovery,
              ready: true,
            }),
          },
        ],
      });
    };
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-site-key-000000000000';
    const campaignId = '0f5a0d7e-3f4b-4c5d-9e8f-1a2b3c4d5e6f';
    const response = await discoveryRoute.POST(
      new Request('http://localhost:3000/api/discovery/guide', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Find a better memory circuit',
          config: defaultDiscovery,
          campaignId,
          sessionId: 'session-discovery',
          provider: 'anthropic',
          model: 'claude-sonnet-5',
          messages: [],
        }),
      }),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.cost.recorded, true);
    const rate = await costs.resolvePrice('anthropic', 'claude-sonnet-5');
    assert.equal(body.cost.usd, (700 * rate.input + 300 * rate.output) / 1e6);
    const row = (await pg.query("SELECT * FROM llm_usage WHERE experiment_id='session-discovery'"))
      .rows[0];
    assert.equal(row.surface, 'discovery-guide');
    assert.equal(row.campaign_id, campaignId);
    assert.equal(row.credential_source, 'site');
    assert.ok(!row.key_hint.includes('sk-ant'));
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    globalThis.fetch = originalFetch;
  }
});

test('a billed reply that fails validation is still recorded', async () => {
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/v1/models'))
        return Response.json({ data: [{ id: 'gpt-5', created: 1 }] });
      return Response.json({
        id: 'resp_truncated',
        status: 'incomplete',
        model: 'gpt-5',
        usage: { input_tokens: 500, output_tokens: 8192 },
        output: [],
      });
    };
    const response = await guideRoute.POST(
      new Request('http://localhost:3000/api/guide', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Explain the plan in great detail',
          stage: 0,
          plan: {
            task: '',
            goal: '',
            duplicates: 32,
            prune: 0,
            memory: false,
            population: 'cb_intrinsic',
            seeds: 3,
            epochs: 12,
            seed: 41,
            budget: 'quick',
          },
          messages: [],
          provider: 'openai',
          model: 'gpt-5',
          sessionId: 'session-truncated',
          execution: 'browser',
        }),
      }),
    );
    assert.equal(response.status, 502);
    const row = (await pg.query("SELECT * FROM llm_usage WHERE experiment_id='session-truncated'"))
      .rows[0];
    assert.ok(row, 'the billed call must be in the ledger');
    assert.equal(row.output_tokens, 8192);
    assert.equal(row.model, 'gpt-5');
    // Discovery: a max_tokens stop is billed too.
    globalThis.fetch = async (url) => {
      if (String(url).includes('/v1/models'))
        return Response.json({ data: [{ id: 'claude-sonnet-5', created_at: '2026-01-01' }] });
      return Response.json({
        id: 'msg_truncated',
        stop_reason: 'max_tokens',
        model: 'claude-sonnet-5',
        usage: { input_tokens: 400, output_tokens: 6000 },
        content: [{ type: 'text', text: '{"text": "partial' }],
      });
    };
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-site-key-000000000000';
    const discovery = await discoveryRoute.POST(
      new Request('http://localhost:3000/api/discovery/guide', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Go on',
          config: defaultDiscovery,
          sessionId: 'session-truncated-discovery',
          provider: 'anthropic',
          model: 'claude-sonnet-5',
          messages: [],
        }),
      }),
    );
    assert.equal(discovery.status, 502);
    const drow = (
      await pg.query("SELECT * FROM llm_usage WHERE experiment_id='session-truncated-discovery'")
    ).rows[0];
    assert.equal(drow.output_tokens, 6000);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    globalThis.fetch = originalFetch;
  }
});

test('a bookkeeping failure returns an unrecorded cost instead of throwing', async () => {
  const count = async () => (await pg.query('SELECT count(*)::int AS n FROM llm_usage')).rows[0].n;
  const beforeCount = await count();
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await costs.recordUsageSafely(entry({ surface: 'not-a-surface' }));
    assert.equal(result.recorded, false);
    assert.equal(result.usd, null);
    assert.deepEqual(result.alerts, []);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(await count(), beforeCount);
  await assert.rejects(() => costs.recordUsage(entry({ surface: 'not-a-surface' })));
});

test('service tiers and 1-hour cache writes are read from responses and priced with tier rates', async () => {
  const flex = costs.usageFromResponse('openai', {
    id: 'resp_flex',
    service_tier: 'flex',
    usage: { input_tokens: 1000, output_tokens: 100 },
  });
  assert.equal(flex.serviceTier, 'flex');
  const fast = costs.usageFromResponse('anthropic', {
    id: 'msg_fast',
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      speed: 'fast',
      cache_creation_input_tokens: 300,
      cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
    },
  });
  assert.equal(fast.serviceTier, 'fast');
  assert.equal(fast.cacheWrite, 100);
  assert.equal(fast.cacheWrite1h, 200);
  assert.equal(
    costs.usageFromResponse('anthropic', { usage: { service_tier: 'priority' } }).serviceTier,
    'priority',
  );
  const rates = {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
    cacheWrite1h: 4,
    inputFlex: 1,
    outputFlex: 5,
    cacheReadFlex: 0.1,
    inputPriority: 4,
    outputPriority: 20,
    cacheReadPriority: null,
    fastMultiplier: 2,
  };
  const M = 1e6;
  assert.equal(contract.costFor(rates, usage({ input: M, output: M, serviceTier: 'flex' })), 6);
  assert.equal(
    contract.costFor(rates, usage({ input: M, output: 0, cacheRead: M, serviceTier: 'priority' })),
    8,
  );
  assert.equal(
    contract.costFor(rates, usage({ input: M, output: M, cacheWrite1h: M, serviceTier: 'fast' })),
    (2 + 10 + 4) * 2,
  );
  assert.equal(
    contract.costFor(rates, usage({ input: 0, output: 0, cacheWrite: M, cacheWrite1h: M })),
    6.5,
  );
  assert.equal(
    contract.ratesForTier({ input: 2, output: 10, cacheRead: null, cacheWrite: null }, 'flex')
      .exact,
    false,
  );
  assert.equal(
    contract.costFor(
      { input: 2, output: 10, cacheRead: null, cacheWrite: null },
      usage({ input: M, output: 0, serviceTier: 'flex' }),
    ),
    2,
  );
  const gpt5 = await costs.resolvePrice('openai', 'gpt-5');
  assert.equal(gpt5.inputFlex, 0.625);
  assert.equal(gpt5.inputPriority, 2.5);
  const opus = await costs.resolvePrice('anthropic', 'claude-opus-5');
  assert.equal(opus.fastMultiplier, 2);
  assert.equal(opus.cacheWrite1h, 10);
  const recorded = await costs.recordUsage(
    entry({
      provider: 'openai',
      model: 'gpt-5',
      experimentId: 'session-flex',
      usage: usage({ input: 1000, output: 100, serviceTier: 'flex' }),
    }),
  );
  assert.equal(recorded.usd, (1000 * 0.625 + 100 * 5) / 1e6);
  const row = (
    await pg.query("SELECT service_tier, rates FROM llm_usage WHERE experiment_id='session-flex'")
  ).rows[0];
  assert.equal(row.service_tier, 'flex');
  assert.equal(JSON.parse(row.rates).input, 0.625);
});

test('the model list flags models without a stored rate', async () => {
  try {
    globalThis.fetch = async (url) =>
      String(url).includes('api.openai.com/v1/models')
        ? Response.json({
            data: [
              { id: 'gpt-5', created: 2 },
              { id: 'gpt-6-nova', created: 3 },
            ],
          })
        : Response.json({ data: [] });
    const body = await (await providersRoute.GET()).json();
    const openai = body.providers.find((p) => p.id === 'openai');
    assert.deepEqual(
      openai.models.map((m) => [m.id, m.priced]),
      [
        ['gpt-6-nova', false],
        ['gpt-5', true],
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a refresh is skipped while prices are fresh', async () => {
  const skipped = await pricesRoute.POST(
    new Request('http://localhost:3000/api/costs/prices?ifStale=7', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    }),
  );
  assert.equal(skipped.status, 200);
  assert.equal((await skipped.json()).skipped, true);
  assert.equal(await costs.pricesStale(7), false);
  assert.equal(await costs.pricesStale(0.0000001), true);
});

test('admin keys are verified before storage and billed reports reconcile against the ledger', async () => {
  const request = (method, body) =>
    new Request('http://localhost:3000/api/costs/billing', {
      method,
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const today = new Date().toISOString().slice(0, 10);
  const openaiReport = (page) =>
    Response.json({
      object: 'page',
      data: [
        {
          object: 'bucket',
          start_time: Math.floor(Date.parse(today + 'T00:00:00Z') / 1000),
          end_time: 0,
          results: page
            ? [
                {
                  object: 'organization.costs.result',
                  amount: { value: 0.25, currency: 'usd' },
                  line_item: 'gpt-5, output',
                  project_id: null,
                },
              ]
            : [
                {
                  object: 'organization.costs.result',
                  amount: { value: 1.5, currency: 'usd' },
                  line_item: 'gpt-5, input',
                  project_id: null,
                },
              ],
        },
      ],
      has_more: !page,
      next_page: page ? null : 'page_2',
    });
  const anthropicReport = () =>
    Response.json({
      data: [
        {
          starting_at: today + 'T00:00:00Z',
          ending_at: today + 'T00:00:00Z',
          results: [
            {
              amount: '123.45',
              currency: 'USD',
              description: 'Claude Sonnet 5 Usage - Input Tokens',
              model: 'claude-sonnet-5',
              token_type: 'uncached_input_tokens',
            },
            {
              amount: '10',
              currency: 'USD',
              description: 'Web Search Usage',
              model: null,
              cost_type: 'web_search',
            },
          ],
        },
      ],
      has_more: false,
      next_page: null,
    });
  try {
    globalThis.fetch = async () => new Response('{"error":"unauthorized"}', { status: 401 });
    const rejected = await billingRoute.POST(
      request('POST', { provider: 'openai', apiKey: 'sk-admin-not-really-valid-0000000' }),
    );
    assert.equal(rejected.status, 401);
    assert.match((await rejected.json()).error, /admin-scoped key/);
    assert.equal(
      (await pg.query('SELECT count(*)::int AS n FROM billing_connections')).rows[0].n,
      0,
    );
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('api.openai.com/v1/organization/costs'))
        return openaiReport(new URL(u).searchParams.get('page'));
      if (u.includes('api.anthropic.com/v1/organizations/cost_report')) return anthropicReport();
      throw Error('unexpected fetch ' + u);
    };
    for (const provider of ['openai', 'anthropic']) {
      const saved = await billingRoute.POST(
        request('POST', { provider, apiKey: 'sk-admin-test-key-for-' + provider + '-0000' }),
      );
      assert.equal(saved.status, 200);
    }
    const stored = (
      await pg.query(
        'SELECT provider, key_hint, sealed_key FROM billing_connections ORDER BY provider',
      )
    ).rows;
    assert.deepEqual(
      stored.map((r) => [r.provider, r.key_hint]),
      [
        ['anthropic', '•••• 0000'],
        ['openai', '•••• 0000'],
      ],
    );
    assert.ok(!stored.some((r) => r.sealed_key.includes('sk-admin')));
    const credential = await costs.billingCredential('local-workspace', 'openai');
    assert.equal(credential.key, 'sk-admin-test-key-for-openai-0000');
    const synced = await billingSyncRoute.POST(
      new Request('http://localhost:3000/api/costs/billing/sync', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7 }),
      }),
    );
    assert.equal(synced.status, 200);
    const body = await synced.json();
    assert.deepEqual(
      body.syncs.map((x) => [x.provider, x.status, x.rowsUpserted]),
      [
        ['openai', 'succeeded', 2],
        ['anthropic', 'succeeded', 2],
      ],
    );
    const billed = (
      await pg.query(
        'SELECT provider, model, line_item, usd FROM provider_costs ORDER BY provider, line_item',
      )
    ).rows;
    assert.deepEqual(
      billed.map((r) => [r.provider, r.model, r.line_item, Number(r.usd)]),
      [
        ['anthropic', 'claude-sonnet-5', 'Claude Sonnet 5 Usage - Input Tokens', 1.2345],
        ['anthropic', '', 'Web Search Usage', 0.1],
        ['openai', 'gpt-5', 'gpt-5, input', 1.5],
        ['openai', 'gpt-5', 'gpt-5, output', 0.25],
      ],
    );
    const summary = await costs.costSummary({});
    const openaiToday = summary.reconciliation.days.find(
      (d) => d.provider === 'openai' && d.day === today,
    );
    assert.equal(openaiToday.billedUsd, 1.75);
    assert.ok(openaiToday.estimatedUsd > 0);
    const openaiTotal = summary.reconciliation.byProvider.find((p) => p.provider === 'openai');
    assert.equal(openaiTotal.billedUsd, 1.75);
    assert.equal(openaiTotal.coveredDays, 1);
    // A range starting mid-day excludes the partial day from both sides of the comparison.
    const midDay = new Date();
    midDay.setUTCHours(12, 0, 0, 0);
    if (Date.now() > midDay.getTime()) {
      const partial = await costs.reconciliation({ from: midDay.toISOString() });
      assert.equal(
        partial.days.some((d) => d.day === today),
        false,
      );
    }
    const wholeDay = await costs.reconciliation({ from: today + 'T00:00:00.000Z' });
    assert.ok(wholeDay.days.some((d) => d.day === today && d.billedUsd === 1.75));
    const calls = (await costs.costSummary({})).recent;
    assert.equal(calls.find((r) => r.experimentId === 'session-flex').tierRateExact, true);
    // A failed sync keeps the previous billed rows and is logged.
    globalThis.fetch = async () => new Response('down', { status: 500 });
    const failed = await costs.syncProviderCosts('local-workspace', 'openai', 7);
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /HTTP 500/);
    assert.equal(
      (await pg.query("SELECT count(*)::int AS n FROM provider_costs WHERE provider='openai'"))
        .rows[0].n,
      2,
    );
    const connections = await costs.billingConnections('local-workspace');
    assert.equal(connections.find((c) => c.provider === 'openai').lastSync.status, 'failed');
    const removed = await billingRoute.DELETE(request('DELETE', { provider: 'anthropic' }));
    assert.deepEqual(await removed.json(), { removed: true });
    assert.equal(
      (await costs.billingConnections('local-workspace')).find((c) => c.provider === 'anthropic')
        .status,
      'missing',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('acknowledging an alert persists once and the step route changes the next boundary', async () => {
  const request = (method, body) =>
    new Request('http://localhost:3000/api/costs/alerts', {
      method,
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const { alerts } = await (await alertsRoute.GET()).json();
  const pending = alerts.find((a) => !a.acknowledgedAt);
  assert.ok(pending);
  assert.deepEqual(await (await alertsRoute.POST(request('POST', { id: pending.id }))).json(), {
    acknowledged: true,
  });
  const stored = (
    await pg.query('SELECT acknowledged_at FROM spend_alerts WHERE id=$1', [pending.id])
  ).rows[0];
  assert.ok(stored.acknowledged_at);
  assert.deepEqual(await (await alertsRoute.POST(request('POST', { id: pending.id }))).json(), {
    acknowledged: false,
  });
  assert.deepEqual(await (await alertsRoute.POST(request('POST', { id: 999999 }))).json(), {
    acknowledged: false,
  });
  // Lifetime spend is a few dollars; a $1 step must only raise the boundary this call crosses.
  const patched = await alertsRoute.PATCH(request('PATCH', { stepUsd: 1 }));
  assert.deepEqual(await patched.json(), { stepUsd: 1 });
  const total = Number(
    (await pg.query('SELECT COALESCE(SUM(cost_usd),0) AS t FROM llm_usage')).rows[0].t,
  );
  const highest = Number(
    (await pg.query('SELECT MAX(threshold_usd) AS m FROM spend_alerts')).rows[0].m,
  );
  const nextBoundary = Math.floor(Math.max(total, highest)) + 1;
  const small = await costs.recordUsage(entry({ usage: usage({ input: 10, output: 5 }) }));
  assert.deepEqual(small.alerts, []);
  const crossing = await costs.recordUsage(
    entry({
      model: 'claude-opus-5',
      usage: usage({ input: 0, output: Math.ceil(((nextBoundary - total) / 25) * 1e6) + 1000 }),
    }),
  );
  assert.deepEqual(
    crossing.alerts.map((a) => a.thresholdUsd),
    [nextBoundary],
  );
  await costs.setAlertStep(50);
});

test('private cost tables cannot be read using the Supabase anonymous role', async () => {
  await pg.exec('SET ROLE anon');
  for (const table of [
    'llm_usage',
    'model_prices',
    'spend_alerts',
    'cost_settings',
    'pricing_refreshes',
    'billing_connections',
    'provider_costs',
    'billing_syncs',
  ])
    await assert.rejects(() => pg.query(`SELECT * FROM lab.${table}`), /permission denied/);
  await pg.exec('RESET ROLE');
});
