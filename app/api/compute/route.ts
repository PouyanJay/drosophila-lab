import {getChatGPTUser} from '@/app/chatgpt-auth';
import {computeInput,listCompute,saveCompute,getCompute,verifyTrainer} from '@/lib/compute-connections';
import {labDb} from '@/lib/lab-db';
const json=(d:any,status=200)=>Response.json(d,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){const user=await getChatGPTUser();if(!user)return json({error:'Sign in to manage your compute connections.'},401);try{return json({connections:await listCompute(user.userId)});}catch{return json({error:'Compute connections could not load. Please retry.'},503);}}
export async function POST(request:Request){return change(request,false);}
export async function DELETE(request:Request){return change(request,true);}
async function change(request:Request,remove:boolean){const user=await getChatGPTUser();if(!user)return json({error:'Sign in to manage your compute connections.'},401);if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Origin mismatch'},403);const raw=await request.text();if(raw.length>8192)return json({error:'Connection file is too large.'},413);let d;try{d=JSON.parse(raw);}catch{return json({error:'Invalid connection details.'},400);}
 try{if(remove||d.action==='check'){if(typeof d.id!=='string'||!/^[-a-f0-9]{36}$/.test(d.id))return json({error:'Invalid connection.'},400);const c=await getCompute(user.userId,d.id);if(!c)return json({error:'Connection not found.'},404);if(remove){await labDb().prepare('DELETE FROM compute_connections WHERE id = ? AND user_id = ?').bind(d.id,user.userId).run();return json({removed:true});}return json({health:await verifyTrainer(c.url,c.token,user.userId)});}
 const parsed=computeInput.safeParse(d);if(!parsed.success)return json({error:'Provide a machine name, HTTPS address and a trainer secret of at least 32 characters.'},400);return json({connection:await saveCompute(user.userId,parsed.data)});
 }catch(e:any){const known=/trainer|HTTPS|public Internet|DNS|Compute connection/.test(e.message||'');return json({error:known?e.message:'Connection could not be saved. Your existing connections are unchanged.'},400);}}
