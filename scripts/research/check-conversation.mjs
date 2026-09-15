import assert from 'node:assert/strict';
import { createModuleLoader } from '../../tests/helpers/load-typescript.mjs';
const load = createModuleLoader();
const { labConversation } = await load('@/lib/planning/lab-conversation');
const { defaultLabConfig } = await load('@/lib/contracts/lab-contract');
const { guideInput } = await load('@/lib/contracts/guide-contract');
const { guideRequest, parseGuideReply, callGuide } = await load('@/server/guide-adapter');
const { validSession } = await load('@/lib/validation/browser-validation');
let s = {
  stage: 0,
  plan: {
    task: '',
    goal: '',
    duplicates: 128,
    prune: 0,
    memory: true,
    population: 'descending_neuron',
    budget: '',
    seeds: 3,
    epochs: 60,
    seed: 11,
  },
  labConfig: defaultLabConfig,
};
const send = (text) => (s = labConversation(text, s.stage, s.plan, s.labConfig));
for (const t of ['Remember a cue', 'Higher accuracy', 'Add 32 inherited copies', 'Pilot · 3 seeds'])
  send(t);
assert.equal(s.stage, 4);
assert.deepEqual(s.labConfig, defaultLabConfig);
send(
  'Use 64 copies, 150 updates, batch size 2, 12 timesteps, learning rate 0.005, 64 training examples, 32 validation examples and 48 test examples',
);
assert.deepEqual(s.labConfig, {
  ...defaultLabConfig,
  duplicates: 64,
  updates: 150,
  batch: 2,
  timesteps: 12,
  learningRate: 0.005,
  trainExamples: 64,
  validationExamples: 32,
  testExamples: 48,
});
send('Set seeds to [7, 19]');
assert.deepEqual(s.labConfig.seeds, [7, 19]);
send('Change population to visual projection');
assert.equal(s.labConfig.population, 'visual_projection');
const exact = structuredClone(s.labConfig);
send('Use 900 copies');
assert.deepEqual(s.labConfig, exact);
send('Set seeds to [7, 7]');
assert.deepEqual(s.labConfig, exact);
send('Use 9 test examples');
assert.deepEqual(s.labConfig, exact);
for (const action of ['start', 'pause', 'resume', 'cancel', 'status', 'repeat']) {
  send(action);
  assert.equal(s.action, action);
  assert.deepEqual(s.labConfig, exact);
}
for (const text of [
  'run me through the results',
  'cancel that idea',
  'start with a question',
  'repeat the explanation',
])
  assert.equal(labConversation(text, 4, s.plan, s.labConfig).action, 'none');
assert.equal(labConversation('Start when ready', 4, s.plan, s.labConfig).action, 'none');
assert.equal(labConversation('start', 0, s.plan, s.labConfig).action, 'none');
const data = {
  execution: 'lab',
  text: 'Review my settings',
  stage: 4,
  plan: s.plan,
  labConfig: s.labConfig,
  jobContext: {
    id: 'measured-example',
    status: 'completed',
    config: defaultLabConfig,
    progress: null,
    source: 'development-example',
  },
  messages: [],
  provider: 'openai',
  model: 'test-model',
  evidence: {
    delta: 0,
    speedup: 0.87,
    interval: [0, 0],
    originalAccuracy: 0.58,
    candidateAccuracy: 0.58,
    ablationAccuracy: 0.52,
  },
};
assert(guideInput.safeParse(data).success);
assert(validSession({ ...s, messages: [], execution: 'lab', selectedJob: 'example' }));
assert(!validSession({ ...s, messages: [], labConfig: { ...s.labConfig, batch: 0 } }));
for (const provider of ['openai', 'anthropic']) {
  const request = guideRequest(provider, 'test-model', 'test-only-key', data),
    schema =
      provider === 'openai'
        ? request.body.text.format.schema
        : request.body.output_config.format.schema;
  assert(schema.required.includes('labConfig'));
  assert(schema.required.includes('action'));
  assert.equal(schema.properties.labConfig.additionalProperties, false);
  const msgs = provider === 'openai' ? request.body.input : request.body.messages;
  assert.deepEqual(JSON.parse(msgs.at(-1).content).currentLabConfig, exact);
  assert.equal(JSON.parse(msgs.at(-1).content).currentJob.source, 'development-example');
  const wrap = (answer) =>
    provider === 'openai'
      ? {
          status: 'completed',
          output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }],
        }
      : { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }] };
  assert.deepEqual(
    parseGuideReply(provider, wrap({ ...s, text: 'Reviewed', action: 'none' }), 'lab').labConfig,
    exact,
  );
  assert.throws(() =>
    parseGuideReply(
      provider,
      wrap({ ...s, text: 'Invalid', labConfig: { ...exact, seeds: [7, 7] } }),
      'lab',
    ),
  );
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json(
        wrap({ ...s, text: 'Updated', action: 'start', labConfig: { ...exact, duplicates: 16 } }),
      );
    const reply = await callGuide(provider, 'test-model', 'test-only-key', data);
    assert.equal(reply.action, 'none');
  } finally {
    globalThis.fetch = original;
  }
}
console.log(
  'Passed: staged cue-memory flow; all 12 configurable fields; arbitrary paired seeds; invalid settings preserve draft; explicit actions; shared settings and measured-run context for both providers; changed drafts cannot auto-start; session validation. Provider calls mocked.',
);

const { actionBlock, LabSubmission } = await load('@/lib/client/lab-run-client');
assert(actionBlock('start', false, 4, null, false));
assert(actionBlock('start', true, 3, null, false));
assert(actionBlock('pause', true, 4, { status: 'completed' }, false));
assert(actionBlock('pause', true, 4, { status: 'running' }, true));
for (const [action, status] of [
  ['pause', 'running'],
  ['resume', 'paused'],
  ['cancel', 'paused'],
])
  assert.equal(actionBlock(action, true, 4, { status }, false), null);
for (const status of ['queued', 'running', 'pausing', 'paused', 'cancelling'])
  assert(actionBlock('start', true, 4, { status }, false));
const submit = new LabSubmission(),
  received = [];
let fail = true;
const request = async (path, options) => {
  const body = JSON.parse(options.body);
  received.push(body);
  if (fail) {
    fail = false;
    throw Error('Response lost after acceptance');
  }
  return { id: 'job-1', status: 'queued', config: body.config };
};
await assert.rejects(submit.start(exact, request));
const accepted = await submit.start(exact, request);
assert.equal(received[0].requestKey, received[1].requestKey);
assert.deepEqual(accepted.config, exact);
await submit.start(exact, request);
assert.notEqual(received[1].requestKey, received[2].requestKey);
const next = { ...exact, duplicates: 4 };
await submit.start(next, request);
assert.deepEqual(accepted.config, exact);
assert.equal(received.at(-1).config.duplicates, 4);
console.log(
  'Passed: real-run lifecycle guards, disconnected blocking, retry-stable submissions, new-run identity and immutable accepted configuration. HTTP responses mocked.',
);

const { experimentSuggestions, suggestionPrompt } = await load(
  '@/lib/planning/experiment-suggestions',
);
for (const starter of experimentSuggestions) {
  const reply = labConversation(starter.prompt, 0, s.plan, defaultLabConfig);
  assert.equal(reply.stage, 4);
  assert.equal(reply.labConfig.task, starter.id);
  assert.equal(reply.action, 'none');
  assert.deepEqual(reply.labConfig.seeds, [41, 42, 43]);
  assert(suggestionPrompt(starter, 'browser').includes('24 / 12 / 24'));
  assert(suggestionPrompt(starter, 'browser').includes('internal connections fixed'));
}
console.log(
  'Passed: both descriptive starter briefs prepare complete reviewable plans without starting jobs; browser briefs use the supported readout protocol.',
);
