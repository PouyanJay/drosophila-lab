import assert from 'node:assert/strict';
import {makeGraph,mutateGraph,randomizeGraph,validateGraph,runExperiment,replay,compile,step} from '../public/engine.js';
const a=makeGraph(48,42);assert.deepEqual(a,makeGraph(48,42));validateGraph(a);
const b=mutateGraph(a,'expand',25,73,2);assert.equal(b.nodes.length,60);assert.equal(a.nodes.length,48);assert.ok(b.edges.length>a.edges.length);
const pruned=mutateGraph(a,'prune',40,7);assert.ok(pruned.edges.length<a.edges.length);assert.equal(pruned.nodes.length,a.nodes.length);
const rewired=mutateGraph(a,'rewire',30,7);validateGraph(rewired);
const random=randomizeGraph(b);assert.equal(random.nodes.length,b.nodes.length);assert.equal(random.edges.length,b.edges.length);
assert.throws(()=>validateGraph({...a,nodes:[...a.nodes,a.nodes[0]]}));assert.throws(()=>validateGraph({...a,edges:[{source:999,target:0,weight:1}]}));
const cfg={task:'memory',epochs:10,seeds:2,seed:42};
const r=await runExperiment(cfg,[a,b,random]);const repeat=await runExperiment(cfg,[a,b,random]);
for(let i=0;i<3;i++){assert.deepEqual(r.models[i].runs.map(r=>r.weights),repeat.models[i].runs.map(r=>r.weights));assert.deepEqual(r.models[i].accuracy,repeat.models[i].accuracy);for(const run of r.models[i].runs){assert.equal(run.curve.length,11);assert.equal(run.bestEpoch,run.curve.reduce((best,p)=>p.loss<best.loss?p:best).epoch);assert.ok(run.testAccuracy>=0&&run.testAccuracy<=1);assert.ok(run.latencyMs>0);const frames=replay(r.models[i].graph,run.weights,run.example.xs);assert.equal(frames.length,16);assert.ok(frames.every(f=>f.state.every(Number.isFinite)&&f.probability>=0&&f.probability<=1));}}
await assert.rejects(()=>runExperiment({...cfg,task:'invalid'},[a]));
console.log('PASS: deterministic graph generation, mutations, graph validation, matched control, reproducible training, validation checkpoint selection, real timing, and checkpoint replay.');
console.log(JSON.stringify(r.models.map(m=>({name:m.name,accuracy:m.accuracy,latencyMs:m.latency.mean})),null,2));
