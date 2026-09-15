// Optional full-stack check on a computer with Docker and npm run local running.
// Executes a real, small full-graph training comparison and leaves its evidence saved.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
const origin='http://localhost:3000';
async function api(path,body){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,d.error||d.detail);return d;}
const health=await api('/api/lab/health');assert.equal(health.connected,true);
const config={schema:'malecns-lab/1',task:'cue-memory',duplicates:1,population:'cb_intrinsic',seeds:[41],updates:1,batch:1,timesteps:4,trainExamples:8,validationExamples:8,testExamples:8,learningRate:.01};
let job=await api('/api/lab/jobs',{requestKey:randomUUID(),config});
console.log('Started real validation run '+job.id);
for(let attempt=0;attempt<300&&job.status!=='completed';attempt++){
 assert.ok(!['failed','cancelled'].includes(job.status),job.error||job.status);
 await new Promise(r=>setTimeout(r,1000));job=await api('/api/lab/jobs/'+job.id);
}
assert.equal(job.status,'completed','Training must complete within five minutes on the test machine');
assert.deepEqual(job.config,config);assert.ok(job.result);assert.ok(job.artifacts.length);
const artifact=job.artifacts[0],r=await fetch(origin+'/api/lab/jobs/'+job.id+'/artifacts/'+artifact.name);
assert.equal(r.status,200);
const sha=createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');
assert.equal(sha,artifact.sha256);assert.equal(r.headers.get('X-Artifact-SHA256'),sha);
const again=await api('/api/lab/jobs/'+job.id);assert.deepEqual(again.result,job.result);
console.log('PASS: full-graph training, saved job, retained result and checksummed artifact download.');
