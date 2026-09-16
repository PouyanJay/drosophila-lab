// One real, tiny provider call through the running website to prove the cost ledger end to end.
// Spends real money (well under one cent with the default models); requires LIVE_COST_CHECK=1.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './lib/workspace.mjs';
import { step, section } from './lib/ui.mjs';

if (process.env.LIVE_COST_CHECK !== '1') {
  throw Error(
    'Refusing to spend money without LIVE_COST_CHECK=1. Example: LIVE_COST_CHECK=1 make live-cost-check',
  );
}
const provider = process.env.LIVE_COST_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';
const model =
  process.env.LIVE_COST_MODEL || (provider === 'anthropic' ? 'claude-haiku-4-5' : 'gpt-5-mini');
let port = 3000;
try {
  port = JSON.parse(readFileSync(path.join(root, '.local-data/runtime/web.json'), 'utf8')).port;
} catch {
  throw Error('The website is not running. Start it with make run first.');
}
const base = `http://localhost:${port}`;
const headers = { origin: base, 'Content-Type': 'application/json' };
const sessionId = 'live-cost-check-' + Date.now();
step(`Checking that ${model} is available on the ${provider} connection`);
const providers = await (await fetch(base + '/api/providers')).json();
const status = providers.providers?.find((p) => p.id === provider);
if (status?.status !== 'connected') {
  throw Error(`${provider} is not connected. Add the API key in the model menu first.`);
}
if (!status.models.some((m) => m.id === model)) {
  throw Error(
    `${model} is not in the account's model list. Set LIVE_COST_MODEL to one of: ${status.models
      .map((m) => m.id)
      .slice(0, 8)
      .join(', ')}`,
  );
}
step('Sending one short guide message (billed by the provider)');
const started = Date.now();
const reply = await fetch(base + '/api/guide', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    text: 'Reply with one short sentence: which task should we test first?',
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
    provider,
    model,
    sessionId,
    execution: 'browser',
  }),
});
const body = await reply.json();
if (!reply.ok) {
  throw Error(`The guide call failed (${reply.status}): ${body.error}`);
}
step('Reading the ledger row for this call');
const ledger = await (await fetch(base + '/api/costs?experiment=' + sessionId)).json();
const row = ledger.recent?.[0];
if (!row) {
  throw Error('No ledger row was recorded for the call.');
}
const usd = (v) => (v == null ? 'unpriced' : '$' + Number(v).toFixed(6));
section('LIVE COST CHECK', [
  ['Provider / model', `${provider} / ${row.model}`],
  ['Latency', `${Date.now() - started} ms`],
  [
    'Tokens',
    `${row.inputTokens} in, ${row.cacheReadTokens} cached, ${row.outputTokens} out (${row.reasoningTokens} reasoning)`,
  ],
  ['Service tier', row.serviceTier],
  ['Cost recorded', usd(row.usd)],
  [
    'Reply cost field',
    `${usd(body.cost?.usd)} (recorded: ${body.cost?.recorded}, priced: ${body.cost?.priced})`,
  ],
  ['Alerts raised', String(body.cost?.alerts?.length ?? 0)],
  ['Ledger session', sessionId],
  [
    'Reconcile',
    'Provider cost reports lag by minutes to hours; sync billing in Spending later to compare.',
  ],
]);
if (body.cost?.recorded !== true || body.cost?.priced !== true) {
  throw Error('The call was not fully recorded or priced. See the fields above.');
}
