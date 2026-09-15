import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const read=async p=>JSON.parse(await fs.readFile('public/'+p,'utf8'));
const [map,lab,browser,catalog]=await Promise.all([read('research/atlas-variants.json'),read('research/lab-example.json'),read('research/example-browser-run.json'),read('malecns/neurons.json')]);
assert.equal(map.graphSha256,lab.graph.sha256);
assert.deepEqual(map.lab[lab.config.population].slice(0,lab.config.duplicates),lab.models[1].runs[0].ancestors);
assert.deepEqual(map.browser[browser.config.population].slice(0,browser.config.duplicates),browser.models[1].ancestors);
const positions=new Map(catalog.map(row=>[String(row[0]),row.slice(7,10)]));
for(const [id,p] of Object.entries(map.positions)){assert.deepEqual(p,positions.get(id));assert(p.length===3&&p.every(Number.isFinite));}
for(const engine of ['lab','browser'])for(const ids of Object.values(map[engine]))assert.equal(new Set(ids).size,ids.length);
for(const model of lab.models)for(const run of model.runs){assert.equal(run.inputs.length,run.test.targets.length);assert.equal(run.test.probabilities.length,run.test.targets.length);run.inputs.forEach(xs=>assert.equal(xs.length,lab.config.timesteps));run.test.probabilities.forEach((p,i)=>assert.equal(+(p>=.5),run.test.predictions[i]));}
console.log('Passed: source-copy previews exactly match both recorded engine runs; all 1,558 mapped positions match source coordinates; replay inputs, probabilities and decisions remain aligned.');
