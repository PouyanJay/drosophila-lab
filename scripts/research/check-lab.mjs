import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
const out=path.resolve('.sites-runtime/lab-checks');await fs.mkdir(out,{recursive:true});
async function compile(source,name,replacements=[]){let code=await fs.readFile(source,'utf8');for(const [a,b] of replacements)code=code.replaceAll(a,b);await fs.writeFile(path.join(out,name),ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);}
await compile('lib/lab-contract.ts','lab-contract.mjs');
for(const f of ['compute-connections','lab-db','credential-crypto'])await compile('lib/'+f+'.ts',f+'.mjs',[["from 'cloudflare:workers'","from './runtime.mjs'"],...["lab-db","credential-crypto"].map(x=>["from './"+x+"'","from './"+x+".mjs'"])]);await compile('lib/lab-planner.ts','lab-planner.mjs');
const {defaultLabConfig,labConfigSchema,labConfigFromPlan}=await import(path.join(out,'lab-contract.mjs'));
const {labRespond}=await import(path.join(out,'lab-planner.mjs'));
let state={stage:0,plan:{task:'',goal:'',duplicates:128,prune:0,memory:true,population:'descending_neuron',budget:'',seeds:3,epochs:60,seed:11}};
for(const text of ['Remember a cue','Higher accuracy','Add 32 inherited copies','Pilot · 3 seeds'])state=labRespond(text,state.stage,state.plan);
assert.equal(state.stage,4);assert.deepEqual(labConfigFromPlan(state.plan),defaultLabConfig);
assert.throws(()=>labConfigFromPlan({...state.plan,memory:true}));assert.throws(()=>labConfigFromPlan({...state.plan,task:'rule'}));assert.equal(labConfigSchema.safeParse({...defaultLabConfig,testExamples:9}).success,false);
await fs.writeFile(path.join(out,'runtime.mjs'),'export const env={}; export let user=null; export const getChatGPTUser=async()=>user; export const setUser=u=>{user=u};');
await compile('app/api/lab/[...path]/route.ts','route.mjs',[["from '@/lib/compute-connections'","from './compute-connections.mjs'"],["from 'cloudflare:workers'","from './runtime.mjs'"],["from '@/app/chatgpt-auth'","from './runtime.mjs'"],["from '@/lib/lab-contract'","from './lab-contract.mjs'"]]);
const {env,setUser}=await import(path.join(out,'runtime.mjs'));const {GET,POST}=await import(path.join(out,'route.mjs'));
const request=(p,method='GET',body,origin='https://studio.example')=>new Request('https://studio.example/api/lab/'+p,{method,headers:{Origin:origin},body:body?JSON.stringify(body):undefined});
assert.equal((await GET(request('health'))).status,401);setUser({userId:'test-owner'});
assert.equal((await (await GET(request('health'))).json()).connected,false);
assert.equal((await POST(request('jobs','POST',{},'https://bad.example'))).status,403);
env.LAB_SERVICE_URL='https://trainer.example';env.LAB_SERVICE_TOKEN='test-server-secret';let seen;
const original=globalThis.fetch;globalThis.fetch=async(url,init)=>{seen={url:String(url),init};return Response.json({status:'ready',engine:'malecns-synaptic-lab/1.0',graphSha256:'729b2b60c7759ead12163cc30daa2b8a3abf8565f0f5773f19fde20cfaa14f7b'});};
try{
 const health=await (await GET(request('health'))).json();assert.equal(health.connected,true);assert.equal(JSON.stringify(health).includes('test-server-secret'),false);
 assert.equal(seen.init.headers.Authorization,'Bearer test-server-secret');assert.match(seen.init.headers['X-Lab-Owner'],/^[a-f0-9]{64}$/);assert.notEqual(seen.init.headers['X-Lab-Owner'],'test-owner');
 assert.equal((await POST(request('jobs','POST',{requestKey:'valid-key',config:{...defaultLabConfig,duplicates:900}}))).status,400);
 await POST(request('jobs','POST',{requestKey:'valid-key',config:defaultLabConfig,owner:'spoofed'}));assert.equal(JSON.parse(seen.init.body).owner,undefined);assert.deepEqual(JSON.parse(seen.init.body).config,defaultLabConfig);
 assert.equal((await GET(request('jobs/arbitrary/artifacts/secret'))).status,404);
 globalThis.fetch=async()=>Response.json({status:'ready',engine:'wrong',graphSha256:'wrong'});assert.equal((await (await GET(request('health'))).json()).connected,false);
}finally{globalThis.fetch=original;}
console.log('Passed: lab planning, exact configuration mapping, unsupported-change rejection, auth/origin, server-only trainer credentials, owner derivation, request validation and graph compatibility. Trainer responses mocked here; real HTTP runner recovery is checked separately.');
