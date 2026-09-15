"""Deterministic CPU training with atomic recovery checkpoints and replay."""
import argparse, hashlib, json, os, platform, time
from pathlib import Path
import numpy as np
import torch
from .model import FlyNetwork
from .protocol import ENGINE, Graph, canonical, code_hash, dataset, digest, validate

class Interrupted(Exception):
    pass

def atomic_json(path, value):
    path=Path(path);tmp=path.with_suffix(path.suffix+'.tmp')
    with open(tmp,'w') as f:
        f.write(canonical(value));f.flush();os.fsync(f.fileno())
    os.replace(tmp,path)

def atomic_torch(path, value):
    path=Path(path);tmp=path.with_suffix(path.suffix+'.tmp')
    with open(tmp,'wb') as f:
        torch.save(value,f);f.flush();os.fsync(f.fileno())
    os.replace(tmp,path)

def state_copy(model):
    return {k:v.detach().clone() for k,v in model.state_dict().items()}

def parameter_hash(model):
    h=hashlib.sha256()
    for name,p in model.named_parameters():
        h.update(name.encode());h.update(p.detach().numpy().tobytes())
    return h.hexdigest()

def evaluate(model, x, y, batch, ablate=False):
    with torch.no_grad():
        logits=torch.cat([model(x[:,i:i+batch],ablate) for i in range(0,len(y),batch)])
    return dict(accuracy=float(((logits>0)==(y>0)).float().mean()),loss=float(torch.nn.functional.binary_cross_entropy_with_logits(logits,y)),predictions=(logits>0).int().tolist(),probabilities=torch.sigmoid(logits).tolist(),targets=y.int().tolist())

def run(config, graph, out, progress=lambda p:None, control=lambda:None, threads=2):
    validate(config);out=Path(out);out.mkdir(parents=True,exist_ok=True)
    torch.set_num_threads(threads);torch.use_deterministic_algorithms(True)
    identity=dict(engine=ENGINE,codeSha256=code_hash(),graphFiles=graph.hashes,config=config,torch=str(torch.__version__),numpy=np.__version__,threads=threads)
    identity_hash=hashlib.sha256(canonical(identity).encode()).hexdigest()
    if (out/'identity.json').exists():
        if json.loads((out/'identity.json').read_text())!=identity: raise ValueError('Resume refused: code, graph, configuration or environment changed')
    else: atomic_json(out/'identity.json',identity)
    atomic_json(out/'config.json',config)
    # Persist the actual split arrays, not merely their seeds.
    arrays={}
    for seed in config['seeds']:
        for split in ('train','validation','test'):
            x,y=dataset(config,seed,split);arrays[f'{seed}_{split}_x']=x.numpy();arrays[f'{seed}_{split}_y']=y.numpy()
    if not (out/'datasets.npz').exists():
        with open(out/'datasets.npz.tmp','wb') as f: np.savez_compressed(f,**arrays);f.flush();os.fsync(f.fileno())
        os.replace(out/'datasets.npz.tmp',out/'datasets.npz')
    else:
        with np.load(out/'datasets.npz',allow_pickle=False) as saved:
            if set(saved.files)!=set(arrays) or any(not np.array_equal(saved[k],v) for k,v in arrays.items()): raise ValueError('Saved dataset differs from protocol')
    def inputs(seed,split): return torch.from_numpy(arrays[f'{seed}_{split}_x']),torch.from_numpy(arrays[f'{seed}_{split}_y'])
    def notify(p):
        atomic_json(out/'progress.json',p);progress(p);control()
    total=2*len(config['seeds'])*config['updates'];members=[]
    for vi,copies in enumerate((0,config['duplicates'])):
        for si,seed in enumerate(config['seeds']):
            key=f'model-{vi}-seed-{seed}'
            if (out/(key+'.json')).exists():
                members.append(json.loads((out/(key+'.json')).read_text()));continue
            control();torch.manual_seed(seed)
            model=FlyNetwork(graph,copies,config['population'])
            initial={k:p.detach().clone() for k,p in model.named_parameters()}
            opt=torch.optim.Adam(model.parameters(),lr=config['learningRate'])
            rng=np.random.default_rng(np.random.SeedSequence([seed,4,20260913]))
            tx,ty=inputs(seed,'train');vx,vy=inputs(seed,'validation')
            latest=out/(key+'-resume.pt');start=0;history=[];best=None;best_loss=float('inf');best_step=0;elapsed=0.
            if latest.exists():
                saved=torch.load(latest,weights_only=True,map_location='cpu')
                if saved['identityHash']!=identity_hash: raise ValueError('Checkpoint identity mismatch')
                model.load_state_dict(saved['model']);opt.load_state_dict(saved['optimizer']);rng.bit_generator.state=saved['rng'];start=saved['step'];history=saved['history'];best=saved['best'];best_loss=saved['bestLoss'];best_step=saved['bestStep'];elapsed=saved['trainingSeconds']
            for step in range(start,config['updates']):
                control();tick=time.perf_counter();idx=rng.choice(len(ty),min(config['batch'],len(ty)),replace=False)
                opt.zero_grad();loss=torch.nn.functional.binary_cross_entropy_with_logits(model(tx[:,idx]),ty[idx])
                if not torch.isfinite(loss): raise ValueError('Training became non-finite')
                loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1.,error_if_nonfinite=True);opt.step()
                val=evaluate(model,vx,vy,config['batch'])
                history.append(dict(step=step+1,trainLoss=float(loss.detach()),validationLoss=val['loss'],validationAccuracy=val['accuracy']))
                if val['loss']<best_loss: best_loss=val['loss'];best=state_copy(model);best_step=step+1
                elapsed+=time.perf_counter()-tick
                atomic_torch(latest,dict(identityHash=identity_hash,model=state_copy(model),optimizer=opt.state_dict(),rng=rng.bit_generator.state,step=step+1,history=history,best=best,bestLoss=best_loss,bestStep=best_step,trainingSeconds=elapsed))
                notify(dict(phase='training',model=vi,seed=seed,step=step+1,updates=config['updates'],completedUpdates=(vi*len(config['seeds'])+si)*config['updates']+step+1,totalUpdates=total,history=history))
            model.load_state_dict(best)
            checkpoint=key+'.pt';atomic_torch(out/checkpoint,dict(identityHash=identity_hash,state=best))
            changes={k:float(torch.linalg.vector_norm(p.detach()-initial[k])) for k,p in model.named_parameters()}
            record=dict(model=vi,seed=seed,history=history,bestStep=best_step,validationLoss=best_loss,trainingSeconds=elapsed,neurons=model.n,edges=model.edges,trainableParameters=sum(p.numel() for p in model.parameters()),recurrentParameters=model.edges,parameterChangeNorms=changes,parameterSha256=parameter_hash(model),ancestors=model.ancestors,checkpoint=checkpoint,checkpointSha256=digest(out/checkpoint))
            atomic_json(out/(key+'.json'),record);members.append(record)
            # Completed best checkpoints suffice; only interrupted members need optimizer files.
            latest.unlink(missing_ok=True)
            del model,opt,initial,best
    selected=int(np.argmin([np.mean([m['validationLoss'] for m in members if m['model']==vi]) for vi in (0,1)]))
    atomic_json(out/'selection.json',dict(selectedByValidation=selected,identityHash=identity_hash))
    # No held-out evaluation occurs until both architectures and all seeds finish training.
    models=[]
    for vi,copies in enumerate((0,config['duplicates'])):
        runs=[]
        for seed in config['seeds']:
            control();notify(dict(phase='evaluating',model=vi,seed=seed,completedUpdates=total,totalUpdates=total))
            record=next(m.copy() for m in members if m['model']==vi and m['seed']==seed)
            torch.manual_seed(seed);model=FlyNetwork(graph,copies,config['population']);x,y=inputs(seed,'test')
            initial=evaluate(model,x,y,config['batch'])
            if digest(out/record['checkpoint'])!=record['checkpointSha256']: raise ValueError('Checkpoint checksum mismatch')
            saved=torch.load(out/record['checkpoint'],weights_only=True);model.load_state_dict(saved['state'])
            test=evaluate(model,x,y,config['batch']);ablation=evaluate(model,x,y,config['batch'],True)
            with torch.no_grad():
                model(x[:,:1]);times=[]
                for _ in range(7):
                    tick=time.perf_counter();model(x[:,:1]);times.append((time.perf_counter()-tick)*1000)
            record.update(test=test,initialAccuracy=initial['accuracy'],ablationAccuracy=ablation['accuracy'],latencyMs=float(np.median(times)),latencySamplesMs=times,inputs=x[:,:,0].T.tolist())
            runs.append(record);del model
        models.append(dict(name='Original' if vi==0 else 'Candidate',runs=runs,accuracy=float(np.mean([r['test']['accuracy'] for r in runs])),latencyMs=float(np.mean([r['latencyMs'] for r in runs]))))
    delta=np.array([b['test']['accuracy']-a['test']['accuracy'] for a,b in zip(models[0]['runs'],models[1]['runs'])]);interval=None
    if len(delta)>=3:
        boot=np.random.default_rng(20260913).choice(delta,(5000,len(delta)),replace=True).mean(axis=1);interval=np.quantile(boot,[.025,.975]).tolist()
    result=dict(schema='malecns-lab-result/1',engine=ENGINE,identityHash=identity_hash,config=config,graph=dict(neurons=graph.counts.shape[0],edges=graph.counts.nnz,sha256=graph.hashes['counts.npz']),datasetSha256=digest(out/'datasets.npz'),codeSha256=code_hash(),hardware=dict(device='cpu',processor=platform.processor() or platform.machine(),threads=threads,torch=str(torch.__version__),numpy=np.__version__),models=models,delta=float(delta.mean()),pairedDeltas=delta.tolist(),interval=interval,speedup=models[0]['latencyMs']/models[1]['latencyMs'],selectedByValidation=selected,protocol='Both topologies train every edge multiplier and class-level dynamics with matched data, batches and update budgets. Validation selects checkpoints before held-out evaluation. Small synthetic pilot; bootstrap intervals are exploratory. No embodied or biological claim.')
    atomic_json(out/'result.json',result)
    files=['config.json','identity.json','datasets.npz','selection.json','result.json']+[m['checkpoint'] for m in members]
    atomic_json(out/'artifacts.json',[dict(name=f,sha256=digest(out/f),bytes=(out/f).stat().st_size) for f in files])
    notify(dict(phase='completed',completedUpdates=total,totalUpdates=total))
    return result

def replay(graph, directory):
    out=Path(directory);result=json.loads((out/'result.json').read_text());identity=json.loads((out/'identity.json').read_text());config=result['config']
    if graph.hashes!=identity['graphFiles'] or code_hash()!=identity['codeSha256']: raise ValueError('Replay source mismatch')
    for a in json.loads((out/'artifacts.json').read_text()):
        if digest(out/a['name'])!=a['sha256']: raise ValueError('Artifact checksum mismatch: '+a['name'])
    torch.set_num_threads(identity['threads']);torch.use_deterministic_algorithms(True)
    for vi,m in enumerate(result['models']):
        for record in m['runs']:
            torch.manual_seed(record['seed']);model=FlyNetwork(graph,config['duplicates'] if vi else 0,config['population']);saved=torch.load(out/record['checkpoint'],weights_only=True);model.load_state_dict(saved['state']);x,y=dataset(config,record['seed'],'test');test=evaluate(model,x,y,config['batch'])
            if test['predictions']!=record['test']['predictions'] or parameter_hash(model)!=record['parameterSha256']: raise ValueError('Replay does not match recorded result')
    return dict(verified=True,models=2,seeds=len(config['seeds']),identityHash=result['identityHash'])

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--graph',required=True);p.add_argument('--out',required=True);p.add_argument('--config');p.add_argument('--replay',action='store_true');a=p.parse_args();g=Graph(a.graph)
    print(json.dumps(replay(g,a.out) if a.replay else run(json.loads(Path(a.config).read_text()),g,a.out,progress=lambda v:print(json.dumps(v),flush=True))))
