import {getCompute,verifyPublicDNS} from '@/lib/compute-connections';
const env=process.env;
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {labConfigSchema} from '@/lib/lab-contract';
const graphSha='729b2b60c7759ead12163cc30daa2b8a3abf8565f0f5773f19fde20cfaa14f7b';
async function handle(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to use the persistent lab.'},{status:401});
 if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origin mismatch'},{status:403});
 const path=new URL(request.url).pathname.replace(/^\/api\/lab\//,'');
 const allowed=request.method==='GET'?/^(health|jobs|jobs\/[a-f0-9-]{36}|jobs\/[a-f0-9-]{36}\/artifacts\/[a-zA-Z0-9.-]+)$/:/^(jobs|jobs\/[a-f0-9-]{36}\/(pause|resume|cancel))$/;
 if(!allowed.test(path))return Response.json({error:'Unknown lab operation'},{status:404});
 let e=env as unknown as {LAB_SERVICE_URL?:string;LAB_SERVICE_TOKEN?:string;LAB_ALLOW_LOCAL?:string};
 const computeId=request.headers.get('X-Compute-ID')||new URL(request.url).searchParams.get('compute');
 if(computeId){if(!/^[a-f0-9-]{36}$/.test(computeId))return Response.json({error:'Invalid compute connection.'},{status:400});try{const c=await getCompute(user.userId,computeId);if(!c)return Response.json({error:'This compute connection is not available to your account.'},{status:404});await verifyPublicDNS(c.url);e={LAB_SERVICE_URL:c.url,LAB_SERVICE_TOKEN:c.token};}catch{return Response.json({error:'The selected machine is unreachable. Open Compute to check or reconnect it.'},{status:502});}}
 if(!e.LAB_SERVICE_URL||!e.LAB_SERVICE_TOKEN)return Response.json(path==='health'?{connected:false,status:'disconnected',message:'Choose Compute in the chat to connect your machine.'}:{error:'No persistent training service is connected.'},{status:path==='health'?200:503,headers:{'Cache-Control':'no-store'}});
 try{
  const base=new URL(e.LAB_SERVICE_URL);if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||(base.protocol!=='https:'&&!(e.LAB_ALLOW_LOCAL==='1'&&base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname))))throw Error('configuration');
  let body:string|undefined;
  if(request.method==='POST'){
   if(Number(request.headers.get('content-length')||0)>8192)return Response.json({error:'Request too large'},{status:413});
   const raw=await request.text();if(raw.length>8192)return Response.json({error:'Request too large'},{status:413});
   if(path==='jobs'){
    let d;try{d=JSON.parse(raw);}catch{return Response.json({error:'Invalid experiment'},{status:400});}
    const config=labConfigSchema.safeParse(d.config);if(!config.success||!/^[-a-zA-Z0-9]{8,80}$/.test(d.requestKey||''))return Response.json({error:'Invalid experiment configuration'},{status:400});body=JSON.stringify({requestKey:d.requestKey,config:config.data});
   }
  }
  const owner=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.userId)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const response=await fetch(new URL(path,base),{method:request.method,headers:{Authorization:'Bearer '+e.LAB_SERVICE_TOKEN,'X-Lab-Owner':owner,'Content-Type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(path.includes('/artifacts/')?120000:15000)});
  if(!response.ok){let message='The training service could not complete this request.';if([400,404,409,429].includes(response.status)){const d:any=await response.json().catch(()=>({}));if(typeof d.detail==='string')message=d.detail.slice(0,400);}return Response.json({error:message},{status:[400,404,409,429].includes(response.status)?response.status:502});}
  if(path.includes('/artifacts/'))return new Response(response.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+path.split('/').pop()+'"','Cache-Control':'no-store','X-Artifact-SHA256':response.headers.get('X-Artifact-SHA256')||''}});
  const data:any=await response.json();if(path==='health'){if(data.graphSha256!==graphSha||data.engine!=='malecns-synaptic-lab/1.0')return Response.json({connected:false,status:'incompatible',message:'The trainer must use the pinned full MaleCNS graph and current lab engine.'});return Response.json({...data,connected:true},{headers:{'Cache-Control':'no-store'}});}
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json(path==='health'?{connected:false,status:'unavailable',message:'The training service is unreachable. Existing jobs may still be running; reconnect to check.'}:{error:'The training service is unreachable. Your saved jobs are retained on its persistent volume.'},{status:path==='health'?200:502,headers:{'Cache-Control':'no-store'}});}
}
export const GET=handle;export const POST=handle;
