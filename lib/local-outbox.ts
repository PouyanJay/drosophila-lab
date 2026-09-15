// Durable retry queue. Supabase remains authoritative after a successful save.
// IndexedDB is only a crash/reconnect buffer; it never contains API credentials.
export type SavedRecord={id:string;kind:string;name:string;data:any};
let opening:Promise<IDBDatabase>|undefined;
function db(){return opening??=new Promise<IDBDatabase>((resolve,reject)=>{
 const r=indexedDB.open('drosophila-outbox',1);
 r.onupgradeneeded=()=>r.result.createObjectStore('pending',{keyPath:'id'});
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>{opening=undefined;reject(r.error);};
});}
async function transaction(mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>void){
 const d=await db();return new Promise<void>((resolve,reject)=>{const t=d.transaction('pending',mode);fn(t.objectStore('pending'));t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});
}
export async function queueRecord(record:SavedRecord){const revision=crypto.randomUUID();await transaction('readwrite',s=>s.put({...record,revision,queuedAt:Date.now()}));}
let flushing:Promise<void>|undefined;
export function flushRecords(){return flushing??=flush().finally(()=>{flushing=undefined;});}
async function flush(){
 const d=await db();
 const rows:any[]=await new Promise((resolve,reject)=>{const r=d.transaction('pending').objectStore('pending').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 for(const row of rows){
  const response=await fetch('/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(((await response.json()) as any).error||'Save failed');
  await transaction('readwrite',s=>{const r=s.get(row.id);r.onsuccess=()=>{if(r.result?.revision===row.revision)s.delete(row.id);};});
 }
}
export async function pendingRecords():Promise<any[]>{const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('pending').objectStore('pending').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
