import { readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validateGraph, mutateGraph, runExperiment } from '../public/engine.js';
const read = (n) =>
  JSON.parse(readFileSync(new URL('../public/malecns/' + n, import.meta.url), 'utf8'));
const manifest = read('manifest.json');
assert.equal(
  manifest.positionedNeuronCount,
  statSync(new URL('../public/malecns/somas.bin', import.meta.url)).size / 16,
);
for (const c of manifest.circuits) {
  const g = read(c.slug + '.json');
  validateGraph(g);
  assert.equal(g.nodes.length, 192);
  assert.equal(new Set(g.nodes.map((n) => n.bodyId)).size, g.nodes.length);
  assert.ok(g.nodes.every((n) => n.original && n.bodyId && n.type !== undefined));
  assert.ok(
    g.edges.every((e) => e.original && e.synapses >= 5 && Math.abs(e.weight) === e.synapses),
  );
  assert.equal(
    g.edges.reduce((s, e) => s + e.synapses, 0),
    c.synapses,
  );
  const variant = mutateGraph(g, 'expand', 10, 7, 2);
  assert.ok(
    variant.nodes.slice(g.nodes.length).every((n) => n.original === false && n.bodyId === null),
  );
  assert.equal(g.nodes.length, 192);
}
const m = read('mushroom.json');
const r = await runExperiment({ task: 'memory', epochs: 10, seeds: 2, seed: 42 }, [
  m,
  structuredClone(m),
]);
assert.deepEqual(r.models[0].accuracy, r.models[1].accuracy);
assert.deepEqual(
  r.models[0].runs.map((r) => r.weights),
  r.models[1].runs.map((r) => r.weights),
);
for (const region of read('meshes.json'))
  for (const f of region.fragments) {
    const raw = readFileSync(new URL('../public/malecns/meshes/' + f.file, import.meta.url));
    const n = raw.readUInt32LE(0);
    assert.equal(n, f.vertices);
    assert.equal((raw.length - 4 - n * 12) % 12, 0);
    assert.ok(raw.length < 25000000);
  }
const skeletons = read('skeletons.json');
assert.ok(skeletons.every((s) => !s.error));
for (const s of skeletons) {
  assert.equal(
    statSync(new URL('../public/malecns/skeletons/' + s.bodyId + '.bin', import.meta.url)).size,
    s.segments * 24,
  );
}
console.log(
  'PASS: source neuron identities, observed synapse counts, engineered-node labels, identical-baseline training, mesh structure and skeleton byte counts.',
);
