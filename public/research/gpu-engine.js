import {pool, step} from './full-engine.js';

// One invocation per neuron; original CSR connectivity stays on the device.
const shader = `
struct Params { n:u32, x:f32, ablate:u32, pad:u32 }
@group(0) @binding(0) var<storage,read> ptr:array<u32>;
@group(0) @binding(1) var<storage,read> indices:array<u32>;
@group(0) @binding(2) var<storage,read> weights:array<f32>;
@group(0) @binding(3) var<storage,read> properties:array<f32>;
@group(0) @binding(4) var<storage,read> previous:array<f32>;
@group(0) @binding(5) var<storage,read_write> next:array<f32>;
@group(0) @binding(6) var<uniform> params:Params;
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id:vec3<u32>) {
 let i=id.x; if(i>=params.n){return;}
 var v=properties[i*3u]*params.x+properties[i*3u+1u];
 if(params.ablate==0u){for(var e=ptr[i];e<ptr[i+1u];e++){v+=weights[e]*previous[indices[e]];}}
 let leak=properties[i*3u+2u];
 next[i]=(1.0-leak)*previous[i]+leak*tanh(v);
}`;

export async function createGPUBackend() {
 if(!navigator.gpu) throw Error('WebGPU is unavailable in this browser.');
 const adapter=await navigator.gpu.requestAdapter();
 if(!adapter) throw Error('No compatible GPU was found.');
 const device=await adapter.requestDevice();
 let lost=false; device.lost.then(()=>{lost=true;});
 const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:shader}),entryPoint:'main'}});
 let current=null, buffers=[], groups=[], params, readback, states;
 function release(){for(const b of buffers)b.destroy();buffers=[];current=null;}
 function buffer(array,usage){const size=Math.max(4,array.byteLength);if(size>device.limits.maxStorageBufferBindingSize)throw Error('This graph exceeds the GPU buffer limit.');const b=device.createBuffer({size,usage:usage|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(b,0,array);buffers.push(b);return b;}
 function prepare(net){if(current===net)return;release();
  const props=new Float32Array(net.n*3);for(let i=0;i<net.n;i++)props.set([net.input[i],net.bias[i],net.leak[i]],i*3);
  const shared=[net.ptr,net.indices,net.weights,props].map(a=>buffer(a,GPUBufferUsage.STORAGE));
  states=[0,1].map(()=>buffer(new Float32Array(net.n),GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC));
  params=buffer(new Uint32Array(4),GPUBufferUsage.UNIFORM);
  readback=device.createBuffer({size:net.n*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});buffers.push(readback);
  groups=[0,1].map(i=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[...shared,states[i],states[1-i],params].map((b,binding)=>({binding,resource:{buffer:b}}))}));current=net;
 }
 async function encode(net,xs,ablate=false){if(lost)throw Error('GPU connection was lost. Please reconnect this device and rerun.');prepare(net);device.queue.writeBuffer(states[0],0,new Float32Array(net.n));let index=0;
  for(const x of xs){const p=new ArrayBuffer(16);new Uint32Array(p).set([net.n,0,ablate?1:0,0]);new Float32Array(p)[1]=x;device.queue.writeBuffer(params,0,p);const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,groups[index]);pass.dispatchWorkgroups(Math.ceil(net.n/128));pass.end();device.queue.submit([encoder.finish()]);index=1-index;}
  const copy=device.createCommandEncoder();copy.copyBufferToBuffer(states[index],0,readback,0,net.n*4);device.queue.submit([copy.finish()]);await readback.mapAsync(GPUMapMode.READ);const out=new Float32Array(readback.getMappedRange().slice(0));readback.unmap();return out;
 }
 const backend={name:'webgpu',async features(net,raw,progress=()=>{},ablate=false){prepare(net);const out=[];for(let i=0;i<raw.length;i++){out.push({x:pool(net,await encode(net,raw[i].xs,ablate)),y:raw[i].y});progress((i+1)/raw.length);}return out;},destroy(){release();device.destroy();}};
 // A real compute/readback check against the CPU recurrence before reporting ready.
 try {const test={n:2,c:1,ptr:new Uint32Array([0,1,2]),indices:new Uint32Array([1,0]),weights:new Float32Array([.5,-.3]),input:new Float32Array([1,.5]),bias:new Float32Array([.02,-.01]),leak:new Float32Array([.7,.22]),classes:new Uint32Array([0,0]),counts:new Uint32Array([2])};let expected=new Float32Array(2);for(const x of [.4,0,-.2])expected=step(test,expected,x);const actual=await encode(test,[.4,0,-.2]);if(actual.some((x,i)=>!Number.isFinite(x)||Math.abs(x-expected[i])>1e-5))throw Error('GPU numerical check failed.');release();return backend;}catch(e){backend.destroy();throw e;}
}
