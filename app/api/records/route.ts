import {validSession,validBrowserResult} from '@/lib/browser-validation';
import {validStudy,validStudyResult} from '@/lib/research-validation';
import {labDb} from '@/lib/lab-db';
export async function GET(request:Request){
 try{
  const p=new URL(request.url).searchParams,kind=p.get('kind'),id=p.get('id');
  if(!['graph','run','study','study-run','browser-run','agent-session'].includes(kind||''))return Response.json({error:'Invalid record type'},{status:400});
  if(id){const row:any=await labDb().prepare('SELECT * FROM lab_records WHERE kind=? AND id=?').bind(kind,id).first();return row?Response.json({record:{...row,payload:undefined,data:JSON.parse(row.payload)}}):Response.json({error:'Record not found'},{status:404});}
  const offset=Math.max(0,Math.min(100000,Number(p.get('offset'))||0)),q='%'+(p.get('q')||'').slice(0,120)+'%';
  const summary=p.get('summary')==='1';
  const result=await labDb().prepare('SELECT id,kind,name,created_at,updated_at'+(summary?'':',payload')+' FROM lab_records WHERE kind=? AND name ILIKE ? ORDER BY updated_at DESC,id LIMIT 50 OFFSET ?').bind(kind,q,offset).all();
  return Response.json({records:result.results.map((r:any)=>({...r,payload:undefined,...(!summary?{data:JSON.parse(r.payload)}:{})})),more:result.results.length===50});
 }catch{return Response.json({error:'Local history is unavailable. Check that the workspace is running.'},{status:503});}
}
export async function PATCH(request:Request){
 try{const {id,name}=await request.json() as any;if(typeof id!=='string'||typeof name!=='string'||!name.trim()||name.length>120)return Response.json({error:'Invalid name'},{status:400});
 await labDb().prepare('UPDATE lab_records SET name=?,updated_at=now() WHERE id=?').bind(name.trim(),id).run();return Response.json({saved:true});}catch{return Response.json({error:'Rename failed'},{status:503});}
}
export async function DELETE(request:Request){
 try{const id=new URL(request.url).searchParams.get('id');if(!id)return Response.json({error:'Missing id'},{status:400});await labDb().prepare('DELETE FROM lab_records WHERE id=?').bind(id).run();return Response.json({deleted:true});}catch{return Response.json({error:'Delete failed'},{status:503});}
}
export async function POST(request:Request){try{if(request.headers.get('origin')&&new URL(request.headers.get('origin')!).host!==new URL(request.url).host)return Response.json({error:'Origin mismatch'},{status:403});const raw=await request.text();if(raw.length>1500000)return Response.json({error:'Record exceeds 1.5 MB limit.'},{status:413});let body;try{body=JSON.parse(raw);}catch{return Response.json({error:'Invalid JSON'},{status:400});}const{id,kind,name,data}=body;if(typeof id!=='string'||id.length>150||!['graph','run','study','study-run','browser-run','agent-session'].includes(kind)||typeof name!=='string'||name.length>120||!data||typeof data!=='object')return Response.json({error:'Invalid record.'},{status:400});if(kind==='graph'&&(!Array.isArray(data.nodes)||data.nodes.length>512||!Array.isArray(data.edges)||data.edges.length>20000))return Response.json({error:'Invalid graph.'},{status:400});if(kind==='run'&&(!Array.isArray(data.models)||!data.config||data.models.length>4))return Response.json({error:'Invalid experiment.'},{status:400});if(kind==='study'&&!validStudy(data))return Response.json({error:'Invalid whole-connectome job.'},{status:400});if(kind==='study-run'&&!validStudyResult(data))return Response.json({error:'Invalid whole-connectome result.'},{status:400});if(kind==='browser-run'&&!validBrowserResult(data))return Response.json({error:'Invalid browser experiment result.'},{status:400});if(kind==='agent-session'&&!validSession(data))return Response.json({error:'Invalid experiment conversation.'},{status:400});await labDb().prepare('INSERT INTO lab_records (id,kind,name,created_at,payload) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=lab_records.name,payload=excluded.payload,updated_at=now() WHERE lab_records.kind=excluded.kind').bind(id,kind,name,new Date().toISOString(),JSON.stringify(data)).run();return Response.json({id,saved:true});}catch(e){console.error(e);return Response.json({error:'Save failed. Your current work is still available to export.'},{status:503});}}
