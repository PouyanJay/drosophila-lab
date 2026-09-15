import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {compile,step,pool,dataset,runExperiment,pairedInterval} from '../../public/research/full-engine.js';
const dir=new URL('../../public/research/browser/',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',dir),'utf8')),data={manifest};
for(const [name,parts] of Object.entries(manifest.files)){const bytes=Buffer.concat(await Promise.all(parts.map(p=>fs.readFile(new URL(p.file,dir)))));const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);data[name]=name==='ids'?new Float64Array(buffer):['weights','signs'].includes(name)?new Float32Array(buffer):new Uint32Array(buffer);}
const net=compile(data),candidate=compile(data,{duplicates:128,population:'descending_neuron',memory:true});
assert.equal(net.n,165122);assert.equal(net.indices.length,6235682);assert.equal(candidate.n,165250);assert.equal(candidate.ancestors.length,128);
for(let i=0;i<net.n;i+=137){let s=0;for(let j=net.ptr[i];j<net.ptr[i+1];j++)s+=Math.abs(net.weights[j]);assert(s<.95001);}
const s=Float32Array.from({length:net.n},(_,i)=>Math.sin(i)*.1),actual=step(net,s,.3);for(const i of [0,115,16000,165121]){let v=net.input[i]*.3+net.bias[i];for(let j=net.ptr[i];j<net.ptr[i+1];j++)v+=net.weights[j]*s[net.indices[j]];assert(Math.abs(actual[i]-(.3*s[i]+.7*Math.tanh(v)))<1e-6);}
assert.notDeepEqual(dataset(101,24,'beacon'),dataset(200101,24,'beacon'));assert.equal(pairedInterval([0]),null);
let last='';const study=process.argv.includes('--study');
const result=await runExperiment(data,{task:study?'evidence':'beacon',goal:'accuracy',duplicates:128,prune:study?.15:0,memory:true,population:'descending_neuron',budget:study?'study':'quick',seeds:study?3:1,epochs:30,seed:91721},p=>{if(p.phase!==last){console.log(p.name,p.phase);last=p.phase;}});
assert.equal(result.models.length,2);assert(result.models.every(m=>m.runs[0].trials.length===(study?64:24)&&m.runs[0].curve.length===31));
for(let i=0;i<2;i++){const model=result.models[i],r=model.runs[0],net=compile(data,model.variant),trial=r.trials[0];let s=new Float32Array(net.n);for(const x of trial.xs)s=step(net,s,x);const f=pool(net,s);let z=0;for(let j=0;j<f.length;j++){const v=j===f.length-1?1:Math.max(-8,Math.min(8,(f[j]-r.normalization.mu[j])/r.normalization.sd[j]));z+=r.weights[j]*v;}assert(Math.abs(1/(1+Math.exp(-z))-trial.probability)<1e-8);assert.equal(r.testAccuracy,r.trials.filter(t=>t.correct).length/r.trials.length);}
await fs.writeFile('/workspace/scratch/browser-engine-measured.json',JSON.stringify(result));
if(study){result.environment={source:'Measured verification run on the development CPU; not this browser',runtime:process.version};await fs.writeFile(new URL('../../public/research/example-browser-run.json',import.meta.url),JSON.stringify(result));}
console.log(JSON.stringify({passed:true,seconds:result.elapsedMs/1000,accuracies:result.models.map(m=>m.accuracy),latencies:result.models.map(m=>m.latencyMs),delta:result.delta}));
