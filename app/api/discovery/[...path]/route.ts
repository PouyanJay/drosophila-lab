import {createHash} from 'node:crypto';
import {discoverySchema} from '@/lib/discovery-contract';
async function handle(request:Request){
 if(process.env.LOCAL_WORKSPACE!=='1')return Response.json({error:'Start the local workspace'},{status:403});
 const path=new URL(request.url).pathname.replace('/api/discovery/','');
 const valid=request.method==='GET'?/^(tasks|campaigns|campaigns\/[a-f0-9-]{36}(\/artifacts\/(result.json|variant-bundle.zip))?)$/:/^(campaigns|campaigns\/[a-f0-9-]{36}\/(pause|resume|cancel))$/;
 if(!valid.test(path))return Response.json({error:'Unknown discovery operation'},{status:404});
 const base=process.env.LAB_SERVICE_URL,token=process.env.LAB_SERVICE_TOKEN;
 if(!base||!token)return Response.json({error:'Start your local workspace to use its discovery worker.'},{status:503});
 const url=new URL(base);if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname))return Response.json({error:'Discovery requires the local trainer'},{status:503});
 let body;
 if(request.method==='POST'){
  if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origin mismatch'},{status:403});
  if(path==='campaigns'){
   const raw=await request.text();if(raw.length>8192)return Response.json({error:'Request too large'},{status:413});
   try{const d=JSON.parse(raw),config=discoverySchema.parse(d.config);if(!/^[a-zA-Z0-9-]{8,80}$/.test(d.requestKey))throw Error();body=JSON.stringify({config,requestKey:d.requestKey});}catch{return Response.json({error:'Invalid discovery configuration'},{status:400});}
  }
 }
 try{
  const endpoint=path==='tasks'?'discovery-tasks':path.replace('campaigns','discoveries');
  const r=await fetch(new URL(endpoint+'',base.endsWith('/')?base:base+'/'),{method:request.method,body,
   headers:{Authorization:'Bearer '+token,'X-Lab-Owner':createHash('sha256').update('local-workspace').digest('hex'),'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(path.includes('artifacts')?120000:15000)});
  if(!r.ok){const d:any=await r.json().catch(()=>({}));return Response.json({error:d.detail||'Discovery worker request failed'},{status:r.status});}
  if(path.includes('artifacts'))return new Response(r.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+path.split('/').pop()+'"','X-Artifact-SHA256':r.headers.get('X-Artifact-SHA256')||'','Cache-Control':'no-store'}});
  return Response.json(await r.json(),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Discovery worker is unavailable. Saved campaigns are retained; restart the local workspace.'},{status:503});}
}
export const GET=handle;export const POST=handle;
