import {runExperiment} from './engine.js';
self.onmessage=async({data})=>{try{const result=await runExperiment(data.config,data.graphs,p=>self.postMessage({type:'progress',data:p}));self.postMessage({type:'complete',data:result});}catch(e){self.postMessage({type:'error',message:e.message});}};
