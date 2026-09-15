'use client';
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {flushRecords} from '@/lib/local-outbox';
export default function SessionHistory({open,onClose,onOpen,onDelete}:{open:boolean;onClose:()=>void;onOpen:(r:any)=>void;onDelete:(id:string)=>void}){
 const [rows,setRows]=useState<any[]>([]),[query,setQuery]=useState(''),[error,setError]=useState(''),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[kind,setKind]=useState('agent-session');
 async function load(offset=0){setBusy(true);try{
  await flushRecords();
  const r=await fetch('/api/records?kind='+kind+'&summary=1&q='+encodeURIComponent(query)+'&offset='+offset);
  if(!r.ok)throw Error('History is unavailable. Start the local workspace and retry.');
  const d:any=await r.json();setRows(a=>offset?[...a,...d.records]:d.records);setMore(d.more);setError('');
 }catch(e:any){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{if(open){const t=setTimeout(()=>load(),200);return()=>clearTimeout(t);}},[open,query,kind]);
 async function record(id:string){const r=await fetch('/api/records?kind='+kind+'&id='+encodeURIComponent(id));if(!r.ok)throw Error('Saved work could not load');return ((await r.json()) as any).record;}
 async function action(row:any,type:string){setBusy(true);try{
  if(type==='open'){onOpen(await record(row.id));onClose();}
  if(type==='export'){const r=await record(row.id),u=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='conversation-'+row.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  if(type==='rename'){const name=window.prompt('Conversation name',row.name);if(name?.trim()){const r=await fetch('/api/records',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id,name})});if(!r.ok)throw Error('Rename failed');await load();}}
  if(type==='delete'&&window.confirm('Delete this conversation? Experiment outputs will be kept.')){const r=await fetch('/api/records?id='+encodeURIComponent(row.id),{method:'DELETE'});if(!r.ok)throw Error('Delete failed');onDelete(row.id);await load();}
 }catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={v=>{if(!v)onClose();}}><DialogContent className="da-dialog"><DialogTitle>Conversations</DialogTitle><DialogDescription>Saved in your local Supabase workspace. Experiment outputs remain available in Past runs.</DialogDescription>
 <div style={{display:'flex',gap:16}}><button aria-pressed={kind==='agent-session'} onClick={()=>{setRows([]);setKind('agent-session');}}>Conversations</button><button aria-pressed={kind==='browser-run'} onClick={()=>{setRows([]);setKind('browser-run');}}>Browser results</button></div>
 <input aria-label="Search conversations" placeholder="Search conversations…" value={query} onChange={e=>setQuery(e.target.value)}/>
 {error&&<p role="alert">{error}<button onClick={()=>load()}>Retry</button></p>}
 <div style={{maxHeight:'55dvh',overflowY:'auto'}}>{rows.map(row=><article key={row.id} style={{padding:'16px 0',borderBottom:'1px solid #27313d'}}>
 <button className="da-text-button" disabled={busy} onClick={()=>action(row,'open')}>{row.name}</button>
 <p style={{fontSize:12,color:'#98a4b5'}}>{new Date(row.updated_at).toLocaleString()}</p>
 <div style={{display:'flex',gap:16}}>{(kind==='agent-session'?['rename','export','delete']:['rename','export']).map(type=><button className="da-text-button" disabled={busy} key={type} onClick={()=>action(row,type)}>{type[0].toUpperCase()+type.slice(1)}</button>)}</div></article>)}</div>
 {!rows.length&&!busy&&!error&&<p>No saved conversations yet.</p>}{more&&<button disabled={busy} onClick={()=>load(rows.length)}>Load more</button>}
 </DialogContent></Dialog>;
}
