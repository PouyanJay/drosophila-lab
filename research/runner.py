"""Whole-MaleCNS differentiable recurrent research runner (CPU/CUDA).
No dense N×N tensor, no anatomy-based node subsampling. See PROTOCOL.md.
"""
import argparse,copy,hashlib,json,time,platform,uuid
from pathlib import Path
import numpy as np
import scipy.sparse as sp
import torch
from torch import nn
from prepare import prepare
ENGINE='malecns-recurrent/3.1'
class SparseMultiply(torch.autograd.Function):
 @staticmethod
 def forward(ctx,x,w,wt):
  ctx.wt=wt
  return torch.from_numpy(w @ x.detach().numpy())
 @staticmethod
 def backward(ctx,grad):return torch.from_numpy(ctx.wt @ grad.contiguous().numpy()),None,None
class FlyModel(nn.Module):
 def __init__(self,counts,classes,signs,labels,variant,device='cpu'):
  super().__init__();self.biological_n=counts.shape[0];self.n=counts.shape[0];self.c=len(labels);self.device_name=device;self.variant=variant
  w=counts.copy();prune=float(variant.get('prune',0));removed=0
  if prune:
   # Remove an exact fraction of lowest-count directed edges; stable index tie break.
   k=int(w.nnz*prune);order=np.argsort(w.data,kind='stable')[:k];w.data[order]=0;w.eliminate_zeros();removed=k
  self.retained_biological_edges=w.nnz;self.removed=removed;self.duplicates=int(variant.get('duplicates',0));self.duplicate_indices=[]
  if self.duplicates:
   population=variant.get('population','descending_neuron')
   if population not in labels:raise ValueError('Unknown source population')
   eligible=np.flatnonzero(classes==labels.index(population));strength=np.asarray(w.sum(axis=0)).ravel()+np.asarray(w.sum(axis=1)).ravel();eligible=eligible[np.argsort(-strength[eligible],kind='stable')];chosen=eligible[:self.duplicates]
   if len(chosen)!=self.duplicates:raise ValueError('Not enough source neurons in population')
   self.duplicate_indices=chosen.tolist()
   # Engineered copies inherit source neuron connectivity. Original biological block is unchanged.
   w=sp.bmat([[w,w[:,chosen]],[w[chosen,:],w[chosen,:][:,chosen]]],format='csr');classes=np.concatenate([classes,classes[chosen]]);signs=np.concatenate([signs,signs[chosen]]);self.n=w.shape[0]
  self.edge_count=w.nnz
  denominator=np.asarray(abs(w).sum(axis=1)).ravel();w.data*=signs[w.indices];w=sp.diags(.95/np.maximum(denominator,1)).dot(w).tocsr().astype(np.float32)
  self.w=w;self.wt=w.T.tocsr();self.register_buffer('classes',torch.as_tensor(classes,dtype=torch.long));self.register_buffer('counts',torch.bincount(self.classes,minlength=self.c).float().clamp(min=1)[:,None])
  self.register_buffer('sensory',torch.tensor([float('sensory' in s) for s in labels])[:,None]);self.encoder=nn.Parameter(torch.randn(self.c,2)*.3);self.gain=nn.Parameter(torch.zeros(self.c));self.leak=nn.Parameter(torch.full((self.c,),-.85));self.bias=nn.Parameter(torch.zeros(self.c));self.readout=nn.Linear(self.c,1)
  self.graft=int(variant.get('graft',0))
  if self.graft:
   self.module=nn.GRUCell(self.c,self.graft);self.feedback=nn.Linear(self.graft,self.c,bias=False);nn.init.normal_(self.feedback.weight,std=.03)
  if variant.get('frozen',False):
   for p in [self.gain,self.leak,self.bias,self.encoder]:p.requires_grad_(False)
  if device=='cuda':
   self.register_buffer('sparse_w',torch.sparse_csr_tensor(torch.from_numpy(w.indptr.astype(np.int64)),torch.from_numpy(w.indices.astype(np.int64)),torch.from_numpy(w.data),size=w.shape))
  self.to(device)
 def pool(self,h):
  return torch.zeros(self.c,h.shape[1],device=h.device).index_add(0,self.classes,h)/self.counts
 def forward(self,x,ablate=False):
  b=x.shape[1];h=torch.zeros(self.n,b,device=x.device);z=torch.zeros(b,self.graft,device=x.device) if self.graft else None
  gain=(.3+1.4*torch.sigmoid(self.gain))[self.classes,None];leak=torch.sigmoid(self.leak)[self.classes,None];bias=self.bias[self.classes,None]
  for t in range(x.shape[0]):
   recurrent=torch.zeros_like(h) if ablate else (torch.sparse.mm(self.sparse_w,h) if self.device_name=='cuda' else SparseMultiply.apply(h,self.w,self.wt))
   u=(self.encoder*self.sensory) @ x[t].T
   if self.graft:
    z=self.module(self.pool(h).T,z);u=u+self.feedback(z).T
   h=(1-leak)*h+leak*torch.tanh(gain*recurrent+u[self.classes]+bias)
  return self.readout(self.pool(h).T).squeeze(-1)
def dataset(seed,n,steps,task):
 rng=np.random.default_rng(seed);x=np.zeros((steps,n,2),np.float32)
 if task=='cue-recall':
  bits=rng.integers(0,2,n);x[0,:,0]=bits*2-1;x[0,:,1]=1;y=bits
 elif task=='temporal-xor':
  bits=rng.integers(0,2,(2,n));x[0,:,0]=bits[0]*2-1;x[steps//2,:,0]=bits[1]*2-1;x[[0,steps//2],:,1]=1;y=bits[0]^bits[1]
 elif task=='evidence-integration':
  bits=rng.integers(0,2,(steps,n));x[:,:,0]=bits*2-1;x[:,:,1]=1;y=bits.sum(axis=0)>steps/2
 else:raise ValueError('Unknown task')
 return torch.tensor(x),torch.tensor(y,dtype=torch.float32)
def evaluate(model,x,y,batch,ablate=False):
 logits=[]
 with torch.no_grad():
  for k in range(0,len(y),batch):logits.append(model(x[:,k:k+batch],ablate).cpu())
 p=torch.cat(logits);return {'accuracy':float(((p>0)==(y.cpu()>0)).float().mean()),'loss':float(nn.functional.binary_cross_entropy_with_logits(p,y.cpu())),'predictions':(p>0).int().tolist()}
def validate(config):
 if config.get('schema')!='malecns-job/1':raise ValueError('Unsupported job schema')
 for key,low,high in [('steps',1,10000),('batch',1,128),('sequenceLength',3,128),('trainExamples',8,100000),('validationExamples',8,10000),('testExamples',8,100000)]:
  if not isinstance(config.get(key),int) or not low<=config[key]<=high:raise ValueError('Invalid '+key)
 if config.get('task') not in ['cue-recall','temporal-xor','evidence-integration']:raise ValueError('Unknown task')
 if not 0<float(config.get('learningRate',0))<=.1:raise ValueError('Invalid learning rate')
 if not isinstance(config.get('seeds'),list) or not 1<=len(config['seeds'])<=20 or any(not isinstance(s,int) or s<0 or s>9999 for s in config['seeds']):raise ValueError('Invalid seeds')
 if len(set(config['seeds']))!=len(config['seeds']):raise ValueError('Seeds must be unique')
 if not isinstance(config.get('variants'),list) or not 1<=len(config['variants'])<=8:raise ValueError('Invalid variants')
 for v in config['variants']:
  if not isinstance(v.get('graft',0),int) or not 0<=v.get('graft',0)<=512 or not 0<=float(v.get('prune',0))<.95:raise ValueError('Invalid architecture')
  if not isinstance(v.get('duplicates',0),int) or not 0<=v.get('duplicates',0)<=512:raise ValueError('Invalid neuron duplication count')
  if v.get('population','descending_neuron') not in ['descending_neuron','ascending_neuron','cb_intrinsic','vnc_intrinsic','visual_projection']:raise ValueError('Invalid population')
  if not isinstance(v.get('name'),str) or len(v['name'])>100:raise ValueError('Invalid variant name')
 return config
def run(config,graphdir,out,device='cpu',threads=4):
 validate(config);torch.set_num_threads(threads);torch.use_deterministic_algorithms(True);out=Path(out);out.mkdir(parents=True,exist_ok=True);g=Path(graphdir);manifest=json.loads((g/'manifest.json').read_text());data=np.load(g/'neurons.npz');counts=sp.load_npz(g/'counts.npz')
 if hashlib.sha256((g/'counts.npz').read_bytes()).hexdigest()!=manifest['graphSha256']:raise ValueError('Graph checksum mismatch')
 if config.get('graphSha256') and config['graphSha256']!=manifest['graphSha256']:raise ValueError('Job graph differs from prepared graph')
 variants=[{'name':'MaleCNS · original topology','graft':0,'prune':0},*config['variants']];result={'schema':'malecns-result/1','engine':ENGINE,'id':str(uuid.uuid4()),'createdAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'config':config,'graph':manifest,'hardware':{'device':device,'processor':platform.processor() or platform.machine(),'threads':threads,'torch':torch.__version__},'models':[],'status':'running','selection':'Validation loss selects architecture and checkpoints. Test evaluated after architecture selection; no test-guided search.'};started=time.perf_counter();pending=[]
 for vi,v in enumerate(variants):
  modelresult={'name':v['name'],'variant':v,'seeds':[]};result['models'].append(modelresult)
  for seed in config['seeds']:
   torch.manual_seed(seed);model=FlyModel(counts,data['classes'],data['signs'],manifest['classes'],v,device);init={k:p.detach().cpu().clone() for k,p in model.named_parameters()};opt=torch.optim.Adam(model.parameters(),lr=config['learningRate']);tx,ty=dataset(10000+seed,config['trainExamples'],config['sequenceLength'],config['task']);vx,vy=dataset(20000+seed,config['validationExamples'],config['sequenceLength'],config['task']);tx,ty,vx,vy=[a.to(device) for a in [tx,ty,vx,vy]];rng=np.random.default_rng(40000+seed);history=[];best=float('inf');checkpoint=None;tic=time.perf_counter()
   for step in range(config['steps']):
    idx=rng.choice(len(ty),size=min(config['batch'],len(ty)),replace=False);opt.zero_grad();loss=nn.functional.binary_cross_entropy_with_logits(model(tx[:,idx]),ty[idx]);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step()
    if step==0 or (step+1)%max(1,config['steps']//4)==0 or step==config['steps']-1:
     val=evaluate(model,vx,vy,config['batch']);history.append({'step':step+1,'trainLoss':float(loss.detach()),'validationLoss':val['loss'],'validationAccuracy':val['accuracy']})
     if val['loss']<best:best=val['loss'];checkpoint={k:t.detach().cpu().clone() for k,t in model.state_dict().items()};beststep=step+1
     print(json.dumps({'event':'progress','model':vi,'seed':seed,**history[-1]}),flush=True)
   model.load_state_dict(checkpoint);name=f'model-{vi}-seed-{seed}.pt';torch.save({'state_dict':checkpoint,'config':config,'variant':v,'graphSha256':manifest['graphSha256'],'engine':ENGINE},out/name)
   changes={k:float(torch.linalg.vector_norm(p.detach().cpu()-init[k])) for k,p in model.named_parameters()};record={'seed':seed,'history':history,'bestStep':beststep,'validationLoss':best,'trainingSeconds':time.perf_counter()-tic,'neurons':model.n+model.graft,'biologicalNeurons':model.biological_n,'engineeredUnits':model.graft+model.duplicates,'graftUnits':model.graft,'duplicateNeurons':model.duplicates,'duplicateSourceBodyIds':[str(data['ids'][i]) for i in model.duplicate_indices],'retainedBiologicalEdges':model.retained_biological_edges,'addedEdges':model.edge_count-model.retained_biological_edges,'edges':model.edge_count,'removedEdges':model.removed,'trainableParameters':sum(p.numel() for p in model.parameters() if p.requires_grad),'parameterChangeNorms':changes,'checkpoint':name,'checkpointSha256':hashlib.sha256((out/name).read_bytes()).hexdigest()};modelresult['seeds'].append(record);pending.append((vi,seed,name,record))
   del model,opt
  (out/'progress.json').write_text(json.dumps(result))
 validation=[float(np.mean([s['validationLoss'] for s in m['seeds']])) for m in result['models']];winner=int(np.argmin(validation));result['selectedModelIndex']=winner
 # Architecture is now selected. All test results are descriptive; never used by optimizer or selector.
 for vi,seed,name,record in pending:
  torch.manual_seed(seed);model=FlyModel(counts,data['classes'],data['signs'],manifest['classes'],variants[vi],device);model.load_state_dict(torch.load(out/name,weights_only=True,map_location=device)['state_dict']);x,y=dataset(30000+seed,config['testExamples'],config['sequenceLength'],config['task']);x,y=x.to(device),y.to(device);test=evaluate(model,x,y,config['batch']);record['testAccuracy']=test['accuracy'];record['testLoss']=test['loss'];record['correct']=int(round(test['accuracy']*len(y)));record['testExamples']=len(y);record['backboneAblationAccuracy']=evaluate(model,x,y,config['batch'],True)['accuracy'];times=[]
  with torch.no_grad():
   model(x[:,:1]);
   for repeat in range(7):
    if device=='cuda':torch.cuda.synchronize()
    tick=time.perf_counter();model(x[:,:1])
    if device=='cuda':torch.cuda.synchronize()
    times.append((time.perf_counter()-tick)*1000)
  record['latencyMsMedian']=float(np.median(times));record['latencyMsSamples']=times;del model
 for m in result['models']:
  m['meanAccuracy']=float(np.mean([s['testAccuracy'] for s in m['seeds']]));m['meanLatencyMs']=float(np.mean([s['latencyMsMedian'] for s in m['seeds']]));m['meanValidationLoss']=float(np.mean([s['validationLoss'] for s in m['seeds']]))
 baseline=result['models'][0];rng=np.random.default_rng(2026)
 for m in result['models'][1:]:
  d=np.array([s['testAccuracy']-b['testAccuracy'] for s,b in zip(m['seeds'],baseline['seeds'])]);boot=rng.choice(d,(5000,len(d)),replace=True).mean(axis=1);m['accuracyDelta']=float(d.mean());m['pairedSeedBootstrap95']=np.quantile(boot,[.025,.975]).tolist() if len(d)>=3 else None;m['speedup']=baseline['meanLatencyMs']/m['meanLatencyMs'];m['evidence']='Exploratory synthetic benchmark; few seeds. No biological or general intelligence claim.'
 result['status']='completed';result['totalSeconds']=time.perf_counter()-started;result['runnerSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();(out/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps({'event':'completed','path':str(out/'result.json'),'accuracy':[m['meanAccuracy'] for m in result['models']]}),flush=True);return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('job');p.add_argument('--graph',default='data/full');p.add_argument('--raw',default='data/raw');p.add_argument('--out',default='runs/latest');p.add_argument('--device',choices=['cpu','cuda'],default='cpu');p.add_argument('--threads',type=int,default=4);a=p.parse_args()
 if not (Path(a.graph)/'manifest.json').exists():prepare(a.raw,a.graph)
 run(json.loads(Path(a.job).read_text()),a.graph,a.out,a.device,a.threads)
