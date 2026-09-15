import { createModuleLoader } from '../../tests/helpers/load-typescript.mjs';
const load = createModuleLoader();
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { defaultPlan, respond } = await load('@/lib/planning/experiment-planner.ts');
const { validBrowserResult, validSession } = await load('@/lib/validation/browser-validation.ts');
let state = { stage: 0, plan: defaultPlan };
for (const text of [
  'Remember a beacon',
  'Higher accuracy',
  'Add 128 memory copies',
  'Quick check · 1 seed',
])
  state = respond(text, state.stage, state.plan);
assert.equal(state.stage, 4);
assert.equal(state.plan.task, 'beacon');
assert.equal(state.plan.duplicates, 128);
assert.equal(state.plan.seeds, 1);
assert.equal(respond('Play Doom', 0, defaultPlan).stage, 0);
assert.equal(respond('Use 256 copies', 4, state.plan).plan.duplicates, 256);
assert.equal(respond('Use 30% pruning', 4, state.plan).plan.prune, 0.3);
assert(
  validSession({ stage: 4, plan: state.plan, messages: [{ role: 'assistant', text: 'Ready' }] }),
);
const result = JSON.parse(await fs.readFile('public/research/example-browser-run.json', 'utf8'));
assert(validBrowserResult(result));
const broken = structuredClone(result);
broken.models[0].runs[0].trials[0].probability = NaN;
assert(!validBrowserResult(broken));
console.log(
  'Planner flow, supported edits, unsupported-task handling, and measured result validation passed.',
);
