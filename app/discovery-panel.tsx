'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Play,Pause,Square,Download,GitBranch,RefreshCw} from 'lucide-react';
import {DiscoveryConfig,discoverySchema} from '@/lib/discovery-contract';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,Tooltip} from 'recharts';
import './discovery.css';
export default function DiscoveryPanel({config,onConfig,selected,onSelect,onInspect,evidenceHost,onEvidence,onStatus,locked}:{config:DiscoveryConfig;onConfig:(c:DiscoveryConfig)=>void;selected:string|null;onSelect:(id:string|null)=>void;onInspect:(meta:any)=>void;evidenceHost:HTMLElement|null;onEvidence:()=>void;onStatus:(status:string)=>void;locked:boolean}){
 const [jobs,setJobs]=useState<any[]>([]),[job,setJob]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[advanced,setAdvanced]=useState(JSON.stringify(config,null,2));
 const submission=useRef<{key:string;config:string}|null>(null),active=useRef(selected);active.current=selected;
 async function api(path:string,body?:any){const r=await fetch('/api/discovery/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d:any=await r.json();if(!r.ok)throw Error(d.error||'Discovery unavailable');return d;}
 async function refresh(){try{const d=await api('campaigns');setJobs(d.jobs);const id=active.current;if(id){const current=await api('campaigns/'+id);if(active.current===id)setJob(current);}else setJob(null);setError('');}catch(e:any){setError(e.message);}}
 useEffect(()=>{refresh();const t=setInterval(refresh,3000);return()=>clearInterval(t);},[selected]);
 useEffect(()=>setAdvanced(JSON.stringify(config,null,2)),[config]);
 useEffect(()=>onStatus(job?.status||'Ready to configure'),[job?.status,onStatus]);
 async function action(name:string){setBusy(true);setError('');try{
  if(name==='start'){
   const validated=discoverySchema.parse(config),serialized=JSON.stringify(validated);
   if(!submission.current||submission.current.config!==serialized)submission.current={key:crypto.randomUUID(),config:serialized};
   const d=await api('campaigns',{config:validated,requestKey:submission.current.key});onSelect(d.id);setJob(d);submission.current=null;
  }else if(selected)setJob(await api('campaigns/'+selected+'/'+name,{}));
  await refresh();
 }catch(e:any){setError(e.message);}finally{setBusy(false);}}
 const p=job?.progress,r=job?.result,records=r?.candidates||p?.candidates||[],best=r?.best||p?.best;
 const [names,setNames]=useState<Record<string,string>>({'cue-memory':'Remember a direction','sequence-recall':'Ordered sequence recall','noisy-evidence':'Decide under noise'});
 useEffect(()=>{api('tasks').then(d=>setNames(Object.fromEntries(d.tasks.map((t:any)=>[t.id,t.name])))).catch(()=>{});},[]);
 const evidence=<section className="discovery-evidence" aria-label="Discovery evidence">
 <div className="discovery-heading"><div><small>DISCOVERY EVIDENCE</small><h2>{r?(r.improved?'Improvement demonstrated':'Search concluded'):job?'Discovery in progress':'No discovery selected'}</h2></div>{job&&<span>{job.status}</span>}</div>
 {r&&<p>{r.outcome.replaceAll('_',' ')} · {r.candidates.length} candidates evaluated. {r.improved?'The finalist passed the predefined confirmation rule.':'This run does not establish an improved brain.'}</p>}
 {p?.trainingCurve?.length>0&&<><h3>Most recent training curve</h3><p>{p.candidate} · seed {p.seed}. Validation selects the saved weights.</p><div style={{height:190,width:'100%',minWidth:0}}><ResponsiveContainer><LineChart data={p.trainingCurve}><XAxis dataKey="step" stroke="#8092a9"/><YAxis stroke="#8092a9"/><Tooltip/><Line dataKey="trainLoss" stroke="#82b5fa" dot={false}/><Line dataKey="validationLoss" stroke="#c3acfa" dot={false}/></LineChart></ResponsiveContainer></div></>}
 {records.length>0&&<><h3>Candidate history</h3><p>Validation scores guide search. These are not final test results.</p><div className="discovery-candidates">{records.map((c:any)=><button key={c.id} onClick={()=>c.topology&&onInspect(c.topology)} disabled={!c.topology}>
 <span><GitBranch size={14}/>{c.id}<small>from {c.parent}</small></span><div className="discovery-bar"><i style={{width:Math.max(1,(c.validationAccuracy??c.pilot)*100)+'%'}}/></div><b>{((c.validationAccuracy??c.pilot)*100).toFixed(1)}%</b><small>{c.promoted?'Full evaluation':'Pilot only'}</small>
 </button>)}</div></>}
 {best?.topology&&<div className="discovery-topology"><p><strong>{best.topology.neurons.toLocaleString()} neurons</strong> · {best.topology.edges.toLocaleString()} edges</p><button onClick={()=>{onInspect(best.topology);}}>Inspect modified source locations</button><small>Atlas markers locate source neurons; they do not reconstruct new anatomical fibers.</small></div>}
 {r?.confirmation&&<><h3>Fresh confirmation tests</h3><div className="discovery-scores"><span><b>{(r.confirmation.delta*100).toFixed(1)} pp</b>{r.metricName||'Accuracy'} gain</span><span><b>{r.confirmation.slowdown.toFixed(2)}×</b>Decision time</span><span><b>{r.confirmation.interval.map((v:number)=>(v*100).toFixed(1)).join(' to ')} pp</b>Paired seed interval</span></div>
 <div className="discovery-table"><table><thead><tr><th>Scenario</th><th>Original</th><th>Candidate</th></tr></thead><tbody>{r.confirmation.scenarios.map((s:any,i:number)=>{const rows=r.confirmation.runs,mean=(name:string)=>rows.reduce((n:number,x:any)=>n+x[name].scenarios[i],0)/rows.length;return <tr key={i}><td>{Object.entries(s).map(([key,value])=>key+' '+String(value)).join(' · ')}</td><td>{(mean('original')*100).toFixed(1)}%</td><td>{(mean('candidate')*100).toFixed(1)}%</td></tr>;})}</tbody></table></div><p>{r.confirmation.caveat}</p></>}
 {r&&<><p>Variant version: {r.variantId||'No finalist'}</p><a className="da-primary" href={'/api/discovery/campaigns/'+job.id+'/artifacts/variant-bundle.zip'} download><Download size={16}/>Export {r.best?(r.improved?'confirmed variant':'experimental variant'):'campaign'} bundle</a></>}
 </section>;
 return <section className="discovery-panel">
 <div className="discovery-heading"><span><GitBranch size={16}/>Architecture discovery</span><button className="da-icon" aria-label="Refresh discoveries" onClick={refresh}><RefreshCw size={15}/></button></div>
 <p>Runs in your local training service. Search for better task performance by changing the fruit-fly graph. Slower candidates are allowed within your limit.</p>
 <label>Task<select value={config.task} onChange={e=>onConfig({...config,task:e.target.value as DiscoveryConfig['task'],taskParameters:'{}'})}>{Object.entries(names).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
 <div className="discovery-facts"><span>{config.candidates} candidates</span><span>{config.maxCopies} added neurons maximum</span><span>{Math.round(config.maxSeconds/60)} minute budget</span><span>Target +{config.minimumGain*100} pp</span><span>Up to {config.maxSlowdown}× slower</span></div>
 <p className="discovery-protocol">Pilot → paired training → one finalist → fresh tests. No improvement is a valid outcome.</p>
 <details><summary>Review all settings</summary><p>Ask the chat to change these, or edit the validated specification here. Delay is in simulation steps.</p><textarea aria-label="Discovery configuration JSON" value={advanced} onChange={e=>setAdvanced(e.target.value)}/><button onClick={()=>{try{onConfig(discoverySchema.parse(JSON.parse(advanced)));setError('');}catch{setError('Invalid configuration. Check the supported limits and scenario count.');}}}>Apply settings</button></details>
 <button className="da-primary" disabled={busy||locked} onClick={()=>action('start')}><Play size={15}/>{busy?'Submitting…':'Start discovery'}</button>
 {jobs.length>0&&<label>Saved discoveries<select value={selected||''} onChange={e=>onSelect(e.target.value||null)}><option value="">Choose a campaign</option>{jobs.map(j=><option key={j.id} value={j.id}>{names[j.config.task as keyof typeof names]||j.config.task} · {j.status} · {new Date(j.created*1000).toLocaleString()}</option>)}</select></label>}
 {job&&<div className="discovery-live"><strong>{job.status} · {p?.phase||'waiting'}</strong><p>{p?.candidate||''}{p?.seed!=null?' · seed '+p.seed:''}</p>{p&&<progress value={p.elapsed} max={p.budgetSeconds}/>}<div className="discovery-actions">{['queued','running','pausing'].includes(job.status)&&<button disabled={busy} onClick={()=>action('pause')}><Pause size={14}/>Pause</button>}{['paused','failed'].includes(job.status)&&<button disabled={busy} onClick={()=>action('resume')}><Play size={14}/>Resume</button>}{['queued','running','pausing','paused','cancelling'].includes(job.status)&&<button disabled={busy} onClick={()=>action('cancel')}><Square size={14}/>Cancel</button>}<button onClick={onEvidence}>View evidence</button></div>{job.error&&<p role="alert">{job.error}</p>}</div>}
 {error&&<p role="alert" className="da-provider-error">{error}</p>}
 {evidenceHost?createPortal(evidence,evidenceHost):null}
 </section>;
}
