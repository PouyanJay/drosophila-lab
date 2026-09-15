import {loadGraph,runExperiment} from './full-engine.js';
import {createGPUBackend} from './gpu-engine.js';
let active=false, graph=null, backend=null;
self.onmessage=async({data})=>{
 if(active)return;active=true;
 try{
  if(!globalThis.crypto?.subtle)throw Error('Local compute needs a secure connection. Open the studio using its HTTPS address.');
  if(!graph){
   let reason='';try{backend=await createGPUBackend();}catch(e){reason=e.message;}
   self.postMessage({type:'progress',data:{phase:backend?'GPU checked. Preparing MaleCNS':'Preparing MaleCNS on CPU',fraction:0}});
   graph=await loadGraph('/research/browser/',p=>self.postMessage({type:'progress',data:{phase:'Downloading and verifying MaleCNS',fraction:p,download:p}}));
   self.postMessage({type:'ready',backend:backend?'webgpu':'cpu',reason,neurons:graph.manifest.neurons});
  }
  if(data.type==='prepare')return;
  const result=await runExperiment(graph,data.config,p=>self.postMessage({type:'progress',data:p}),backend);
  self.postMessage({type:'complete',data:result});
 }catch(e){self.postMessage({type:'error',message:e.message||'Experiment stopped unexpectedly.'});}
 finally{active=false;}
};
