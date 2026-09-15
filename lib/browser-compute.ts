let prepared:Worker|null=null;
export function takeBrowserWorker(){const worker=prepared||new Worker('/research/full-worker.js',{type:'module'});prepared=null;return worker;}
export function prepareBrowserCompute(progress:(text:string)=>void):Promise<string>{
 if(prepared)prepared.terminate();prepared=null;
 return new Promise((resolve,reject)=>{
  const worker=new Worker('/research/full-worker.js',{type:'module'});
  const timeout=setTimeout(()=>fail('Device preparation timed out. Try again.'),180000);
  function fail(message:string){clearTimeout(timeout);worker.terminate();reject(Error(message));}
  worker.onerror=()=>fail('This browser could not start local compute.');
  worker.onmessage=({data})=>{if(data.type==='progress')progress(data.data.phase+(data.data.download?' · '+Math.round(data.data.download*100)+'%':''));if(data.type==='error')fail(data.message);if(data.type==='ready'){clearTimeout(timeout);prepared=worker;worker.onmessage=null;worker.onerror=null;resolve(data.backend==='webgpu'?'Ready · WebGPU':'Ready · CPU (WebGPU unavailable)');}};
  worker.postMessage({type:'prepare'});
 });
}
