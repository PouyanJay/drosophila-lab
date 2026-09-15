import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import 'fake-indexeddb/auto';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../../',import.meta.url));
const directory=mkdtempSync(path.join(tmpdir(),'drosophila-persistence-'));
let pg=await PGlite.create(directory);
await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
await pg.exec(readFileSync(path.join(root,'supabase/migrations/20260915000000_local_workspace.sql'),'utf8'));
await pg.exec('SET search_path=lab,public');
globalThis.__testPool=class {on(){} query(sql,values){return pg.query(sql,values);}};
process.env.DATABASE_URL='postgresql://local-test';
const cache=new Map();
function load(file){
 file=path.resolve(root,file);if(cache.has(file))return cache.get(file);
 let code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 code=code.replace(/from ['"]([^'"]+)['"]/g,(_,specifier)=>{
  let target;
  if(specifier==='pg')target='data:text/javascript,'+encodeURIComponent('export const Pool=globalThis.__testPool');
  else if(specifier.startsWith('@/'))target=load(specifier.slice(2)+'.ts');
  else if(specifier.startsWith('.'))target=load(path.resolve(path.dirname(file),specifier)+'.ts');
  else target=pathToFileURL(require.resolve(specifier)).href;
  return 'from '+JSON.stringify(target);
 });
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(file,url);return url;
}
const api=await import(load('app/api/records/route.ts'));
const outbox=await import(load('lib/local-outbox.ts'));
const sample={plan:{task:'beacon',duplicates:32,prune:0,seeds:3,epochs:12,budget:'quick'},stage:4,messages:[{role:'user',text:'Remember a cue'}],execution:'lab'};
function request(method,body,query=''){return new Request('http://localhost:3000/api/records'+query,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
const post=body=>api.POST(request('POST',body));
const get=query=>api.GET(request('GET',undefined,query)).then(r=>r.json());
test('independent conversations, full history, rename, and database reopen',async()=>{
 assert.equal((await post({id:'session-a',kind:'agent-session',name:'Cue memory',data:sample})).status,200);
 const long={...sample,messages:Array.from({length:80},(_,i)=>({role:i%2?'assistant':'user',text:'Message '+i}))};
 assert.equal((await post({id:'session-b',kind:'agent-session',name:'Noise',data:long})).status,200);
 await api.PATCH(request('PATCH',{id:'session-a',name:'My memory study'}));
 await post({id:'session-a',kind:'agent-session',name:'Old automatic title',data:sample});
 assert.equal((await get('?kind=agent-session&id=session-a')).record.name,'My memory study');
 await pg.close();pg=await PGlite.create(directory);await pg.exec('SET search_path=lab,public');
 assert.equal((await get('?kind=agent-session&id=session-b')).record.data.messages.length,80);
 assert.equal((await get('?kind=agent-session&q=memory&summary=1')).records.length,1);
 assert.equal((await get('?kind=agent-session')).records.length,2);
});
test('browser result preserves exact weights, trials, and provenance through restart',async()=>{
 const result=JSON.parse(readFileSync(path.join(root,'public/research/example-browser-run.json'),'utf8'));
 assert.equal((await post({id:'result-a',kind:'browser-run',name:'Result',data:result})).status,200);
 await pg.close();pg=await PGlite.create(directory);await pg.exec('SET search_path=lab,public');
 assert.deepEqual((await get('?kind=browser-run&id=result-a')).record.data,result);
 await api.DELETE(request('DELETE',undefined,'?id=session-a'));
 assert.equal((await api.GET(request('GET',undefined,'?kind=agent-session&id=session-a'))).status,404);
 assert.ok((await get('?kind=browser-run&id=result-a')).record);
});
test('invalid evidence is rejected and all history pages remain accessible',async()=>{
 assert.equal((await post({id:'bad',kind:'browser-run',name:'Bad',data:{status:'completed'}})).status,400);
 for(let i=0;i<55;i++)await post({id:'page-'+i,kind:'agent-session',name:'Paged '+i,data:sample});
 const a=await get('?kind=agent-session&summary=1'),b=await get('?kind=agent-session&summary=1&offset=50');
 assert.equal(a.records.length,50);assert.equal(a.more,true);assert.equal(b.records.length,6);
 assert.equal(new Set([...a.records,...b.records].map(r=>r.id)).size,56);
 assert.equal('data' in a.records[0],false);
});
test('private tables cannot be read using the Supabase anonymous role',async()=>{
 await pg.exec('SET ROLE anon');
 await assert.rejects(()=>pg.query('SELECT * FROM lab.lab_records'),/permission denied/);
 await pg.exec('RESET ROLE');
});
test('outbox retains failed writes and retries successfully',async()=>{
 const originalFetch=globalThis.fetch;
 try{
  await outbox.queueRecord({id:'offline',kind:'agent-session',name:'Offline work',data:sample});
  globalThis.fetch=async()=>{throw Error('Database offline');};
  await assert.rejects(()=>outbox.flushRecords());
  assert.equal((await outbox.pendingRecords()).length,1);
  globalThis.fetch=async(_url,options)=>api.POST(request('POST',JSON.parse(options.body)));
  await outbox.flushRecords();assert.equal((await outbox.pendingRecords()).length,0);
  assert.equal((await get('?kind=agent-session&id=offline')).record.name,'Offline work');
 }finally{globalThis.fetch=originalFetch;}
});
test('a save completing cannot discard a newer pending revision',async()=>{
 const originalFetch=globalThis.fetch;
 try{
  await outbox.queueRecord({id:'race',kind:'agent-session',name:'First',data:sample});
  globalThis.fetch=async()=>{await outbox.queueRecord({id:'race',kind:'agent-session',name:'Second',data:sample});return Response.json({saved:true});};
  await outbox.flushRecords();
  assert.equal((await outbox.pendingRecords())[0].name,'Second');
  globalThis.fetch=async(_url,options)=>api.POST(request('POST',JSON.parse(options.body)));
  await outbox.flushRecords();assert.equal((await outbox.pendingRecords()).length,0);
 }finally{globalThis.fetch=originalFetch;}
});
after(async()=>{await pg.close();rmSync(directory,{recursive:true,force:true});});

test('discovery conversation retains its campaign, draft and review state',async()=>{
 const {defaultDiscovery}=await import(load('lib/discovery-contract.ts'));
 const data={...sample,discoveryMode:true,discoveryReady:false,discoveryConfig:defaultDiscovery,discoveryId:'c4815ae4-f28d-4e0b-8372-de779a8e12f2'};
 assert.equal((await post({id:'discovery-session',kind:'agent-session',name:'Memory discovery',data})).status,200);
 await pg.close();pg=await PGlite.create(directory);await pg.exec('SET search_path=lab,public');
 assert.deepEqual((await get('?kind=agent-session&id=discovery-session')).record.data,data);
 assert.equal((await post({id:'invalid-discovery',kind:'agent-session',name:'Invalid',data:{...data,discoveryConfig:{...defaultDiscovery,maxCopies:1000000}}})).status,400);
});
