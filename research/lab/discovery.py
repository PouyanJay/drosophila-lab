"""Persistent task-independent topology search with one sealed final test.

The LLM supplies a validated campaign contract. This numerical worker owns
candidate generation, training, selection, budgets and all measured evidence.
"""
import hashlib,json,math,platform,time,zipfile
from pathlib import Path
import numpy as np
import scipy.sparse as sp
from scipy.stats import t as student_t
import torch
from .engine import atomic_json,atomic_torch,state_copy,parameter_hash
from .protocol import canonical,digest
from .discovery_tasks import get_task
from .discovery_contract import validate,OPERATORS
from .discovery_model import structural_graph,DiscoveryNetwork

class BudgetExceeded(Exception):pass

def discovery_code_hash():
    h=hashlib.sha256()
    for name in ('discovery.py','discovery_tasks.py','discovery_contract.py','discovery_model.py','model.py','engine.py','protocol.py','replay_discovery.py'):
        h.update(name.encode());h.update(Path(__file__).with_name(name).read_bytes())
    return h.hexdigest()

def measure(model,data):
    scores=[];losses=[];predictions=[];probabilities=[]
    with torch.no_grad():
        for x,y in data:
            logits=torch.cat([model(x[:,i:i+4]) for i in range(0,len(y),4)])
            score=model.task.score(logits,y)
            if not math.isfinite(score) or not 0<=score<=1:raise ValueError('Task scores must be finite and normalized to [0,1]')
            scores.append(score)
            losses.append(float(model.task.loss(logits,y)))
            predictions.append(model.task.decode(logits));probabilities.append(model.task.probabilities(logits))
    return dict(accuracy=float(np.mean(scores)),loss=float(np.mean(losses)),scenarios=scores,predictions=predictions,probabilities=probabilities)

def train_member(graph,task,c,program,seed,updates,phase,out,control,on_step=lambda curve:None):
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    if (out/'metrics.json').exists():
        saved=json.loads((out/'metrics.json').read_text())
        if digest(out/'best.pt')!=saved['checkpointSha256']:raise ValueError('Checkpoint checksum mismatch')
        return saved
    control();g,topology=structural_graph(graph,program,c['population'])
    torch.manual_seed(seed);model=DiscoveryNetwork(g,task);initial=parameter_hash(model)
    opt=torch.optim.Adam(model.parameters(),lr=.01)
    confirm=phase=='confirmation'
    train_split='confirmation-train' if confirm else 'train'
    val_split='confirmation-validation' if confirm else 'validation'
    count=c['examples'] if phase!='pilot' else max(task.classes*2,c['examples']//2//task.classes*task.classes)
    data=lambda split:[task.generate(c,seed,split,i,count) for i in range(len(task.scenarios(c)))]
    train,val=data(train_split),data(val_split)
    rng=np.random.default_rng(np.random.SeedSequence([seed,71]))
    start=0;best_loss=float('inf');best=None;curve=[]
    if (out/'resume.pt').exists():
        d=torch.load(out/'resume.pt',weights_only=True)
        model.load_state_dict(d['model']);opt.load_state_dict(d['optimizer']);rng.bit_generator.state=d['rng']
        start=d['step'];best_loss=d['bestLoss'];best=d['best'];curve=d['curve']
    for step in range(start,updates):
        control();x,y=train[int(rng.integers(len(train)))];idx=rng.choice(len(y),min(4,len(y)),replace=False)
        opt.zero_grad();loss=task.loss(model(x[:,idx]),y[idx])
        if not torch.isfinite(loss):raise ValueError('Non-finite candidate loss')
        loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1.,error_if_nonfinite=True);opt.step()
        v=measure(model,val);curve.append(dict(step=step+1,trainLoss=float(loss.detach()),validationLoss=v['loss'],validationAccuracy=v['accuracy']))
        if v['loss']<best_loss:best_loss=v['loss'];best=state_copy(model)
        atomic_torch(out/'resume.pt',dict(step=step+1,model=state_copy(model),optimizer=opt.state_dict(),rng=rng.bit_generator.state,bestLoss=best_loss,best=best,curve=curve))
        atomic_json(out/'training.json',dict(step=step+1,updates=updates,curve=curve))
        on_step(curve)
    model.load_state_dict(best);v=measure(model,val)
    atomic_torch(out/'best.pt',dict(state=best,seed=seed,program=program))
    values=dict(seed=seed,validation=v,curve=curve,initialParameterSha256=initial,
        parameterSha256=parameter_hash(model),checkpointSha256=digest(out/'best.pt'),
        parametersChanged=initial!=parameter_hash(model),topology=topology)
    atomic_json(out/'metrics.json',values);(out/'resume.pt').unlink(missing_ok=True)
    return values

def run(c,graph,out,progress=lambda p:None,control=lambda:None,threads=2):
    validate(c);out=Path(out);out.mkdir(parents=True,exist_ok=True)
    task=get_task(c['task']);torch.set_num_threads(threads);torch.use_deterministic_algorithms(True)
    identity=dict(schema='malecns-discovery-identity/1',config=c,graph=graph.hashes,
        codeSha256=discovery_code_hash(),taskVersion=task.version,torch=str(torch.__version__),numpy=np.__version__,threads=threads)
    if (out/'identity.json').exists() and json.loads((out/'identity.json').read_text())!=identity:raise ValueError('Resume refused: campaign code, graph, environment or configuration changed')
    atomic_json(out/'identity.json',identity)
    state=json.loads((out/'campaign.json').read_text()) if (out/'campaign.json').exists() else dict(candidates=[],elapsed=0.,best=None,stale=0,phase='search',nextCandidate=0)
    tick=time.monotonic();prior=state['elapsed'];active={}
    def persist():
        state['elapsed']=prior+time.monotonic()-tick;atomic_json(out/'campaign.json',state)
    def check():
        control()
        if prior+time.monotonic()-tick>=c['maxSeconds']:raise BudgetExceeded()
    def notify(**p):
        active.update(p);persist();payload=dict(**active,elapsed=state['elapsed'],budgetSeconds=c['maxSeconds'],candidates=state['candidates'],best=state['best'])
        atomic_json(out/'progress.json',payload);progress(payload);check()
    def fit(program,label,phase,updates,seeds):
        rows=[]
        for seed in seeds:
            notify(phase=phase,candidate=label,seed=seed,trainingCurve=[])
            member=train_member(graph,task,c,program,seed,updates,phase,out/label/phase/str(seed),check,lambda curve:notify(trainingCurve=curve))
            rows.append(member)
            notify(trainingCurve=member['curve'])
        return dict(accuracy=float(np.mean([r['validation']['accuracy'] for r in rows])),loss=float(np.mean([r['validation']['loss'] for r in rows])),members=rows)
    reason='candidate_budget';confirmation=None
    try:
        baseline_pilot=fit([],'original','pilot',c['pilotUpdates'],c['seeds'][:1])
        baseline=fit([],'original','full',c['fullUpdates'],c['seeds'])
        state['baselineValidation']=baseline['accuracy']
        while state['phase']=='search' and state['nextCandidate']<c['candidates']:
            i=state['nextCandidate'];check()
            # Deterministic lineage: periodically explore from the source to avoid
            # making every proposal descend from one early apparent winner.
            parent=state['best'] if i%3 and state['best'] else None
            program=list(parent['program']) if parent else []
            if len(program)>=4:program=[];parent=None
            used=sum(e['count'] for e in program if e['operator']!='rewire')
            op=OPERATORS[i%len(OPERATORS)]
            if used>=c['maxCopies']:op='rewire'
            count=min(4+(i%3)*4,max(1,c['maxCopies']-used)) if op!='rewire' else 4
            event=dict(operator=op,count=count,seed=c['seed']+i)
            program.append(event);label='candidate-'+str(i)
            pilot=fit(program,label,'pilot',c['pilotUpdates'],c['seeds'][:1])
            record=dict(id=label,parent=parent['id'] if parent else 'original',program=program,pilot=pilot['accuracy'],promoted=False)
            if pilot['loss']<=baseline_pilot['loss']*1.05:
                full=fit(program,label,'full',c['fullUpdates'],c['seeds'])
                record.update(promoted=True,validationAccuracy=full['accuracy'],validationLoss=full['loss'],topology=full['members'][0]['topology'])
                current=state['best'];record['validationGain']=full['accuracy']-baseline['accuracy']
                if current is None or (full['accuracy'],-full['loss'])>(current['validationAccuracy'],-current['validationLoss']):
                    state['best']=dict(record);state['stale']=0
                else:state['stale']+=1
            else:state['stale']+=1
            state['candidates'].append(record);state['nextCandidate']=i+1;persist()
            if state['best'] and state['best']['validationGain']>=c['minimumGain'] and i>=1:
                reason='validation_target';break
            if state['stale']>=c['patience']:reason='no_progress';break
        # Freeze exactly one finalist. Search never resumes after seeing final tests.
        state['phase']='confirmation';state.setdefault('searchStop',reason);persist()
        if state['best'] and state['best']['validationGain']>0:
            best=state['best'];seeds=[s+100000 for s in c['seeds']]
            base=fit([],'original','confirmation',c['confirmationUpdates'],seeds)
            candidate=fit(best['program'],best['id'],'confirmation',c['confirmationUpdates'],seeds)
            atomic_json(out/'selection.json',dict(finalist=best['id'],program=best['program'],chosenUsing='validation only',confirmationSeeds=seeds))
            rows=[];arrays={};models={}
            for seed in seeds:
                pair={}
                for label,program in [('original',[]),(best['id'],best['program'])]:
                    notify(phase='sealed-test',candidate=label,seed=seed)
                    g,meta=structural_graph(graph,program,c['population']);torch.manual_seed(seed);m=DiscoveryNetwork(g,task)
                    saved=torch.load(out/label/'confirmation'/str(seed)/'best.pt',weights_only=True);m.load_state_dict(saved['state'])
                    test=[task.generate(c,seed,'test',i,c['examples']*2) for i in range(len(task.scenarios(c)))]
                    for j,(x,y) in enumerate(test):arrays[f'{seed}-{j}-x']=x.numpy();arrays[f'{seed}-{j}-y']=y.numpy()
                    score=measure(m,test);sample=test[-1][0][:,:1];times=[]
                    with torch.no_grad():
                        m(sample)
                        for _ in range(5):
                            t=time.perf_counter();m(sample);times.append((time.perf_counter()-t)*1000)
                    pair[label]=dict(**score,latencyMs=float(np.median(times)),parameterSha256=parameter_hash(m))
                    del m,g
                rows.append(dict(seed=seed,original=pair['original'],candidate=pair[best['id']]))
            deltas=np.array([r['candidate']['accuracy']-r['original']['accuracy'] for r in rows])
            margin=float(student_t.ppf(.975,len(deltas)-1)*deltas.std(ddof=1)/math.sqrt(len(deltas)))
            interval=[float(deltas.mean()-margin),float(deltas.mean()+margin)]
            slowdown=float(np.mean([r['candidate']['latencyMs'] for r in rows])/np.mean([r['original']['latencyMs'] for r in rows]))
            accepted=bool(deltas.mean()>=c['minimumGain'] and interval[0]>0 and slowdown<=c['maxSlowdown'])
            confirmation=dict(accepted=accepted,delta=float(deltas.mean()),interval=interval,slowdown=slowdown,runs=rows,
                scenarios=task.scenarios(c),criterion='mean gain >= minimumGain, paired seed t interval lower bound > 0, slowdown <= maxSlowdown',
                caveat='Small-seed exploratory evidence on the specified computational task; not a biological or universal intelligence claim.')
            with open(out/'test-datasets.npz','wb') as f:np.savez_compressed(f,**arrays)
            reason='improvement_demonstrated' if accepted else 'no_improvement'
        else:reason='no_improvement'
    except BudgetExceeded:
        reason='time_budget'
    finally:persist()
    if discovery_code_hash()!=identity['codeSha256']:raise ValueError('Worker source changed during the campaign; restart with matching code')
    result=dict(schema='malecns-discovery-result/1',task=c['task'],taskVersion=task.version,metricName=task.metric_name,config=c,
        outcome=reason,searchStop=state.get('searchStop',reason),elapsed=state['elapsed'],
        sourceGraphSha256=graph.hashes['counts.npz'],codeSha256=identity['codeSha256'],
        candidates=state['candidates'],best=state['best'],confirmation=confirmation,
        improved=bool(confirmation and confirmation['accepted']),hardware=dict(threads=threads,processor=platform.machine()))
    result['variantId']=hashlib.sha256(canonical(dict(identity=identity,best=state['best'])).encode()).hexdigest()[:20] if state['best'] else None
    atomic_json(out/'result.json',result)
    files=['result.json','identity.json','campaign.json']
    if state['best']:
        best=state['best'];g,meta=structural_graph(graph,best['program'],c['population'])
        sp.save_npz(out/'variant-counts.npz',g.counts)
        np.savez_compressed(out/'variant-neurons.npz',**g.data)
        atomic_json(out/'variant.json',dict(**meta,variantId=result['variantId'],task=c['task'],sourceGraphSha256=graph.hashes['counts.npz'],confirmed=result['improved'],
            scope='Task-specific computational variant',dynamics='DiscoveryNetwork: leaky tanh, class encoder and matched class/source-probe readout, per-neuron bias and leak'))
        files+=['variant-counts.npz','variant-neurons.npz','variant.json']
        phase='confirmation' if confirmation else 'full'
        for p in sorted((out/best['id']/phase).glob('*/*')):
            if p.name in ('best.pt','metrics.json'):files.append(str(p.relative_to(out)))
        # Include the matched original's weights for independent re-evaluation.
        for p in sorted((out/'original'/phase).glob('*/*')):
            if p.name in ('best.pt','metrics.json'):files.append(str(p.relative_to(out)))
        train_arrays={}
        export_seeds=[s+100000 for s in c['seeds']] if phase=='confirmation' else c['seeds']
        for seed in export_seeds:
            for split in (('confirmation-train','confirmation-validation') if phase=='confirmation' else ('train','validation')):
                for i in range(len(task.scenarios(c))):
                    x,y=task.generate(c,seed,split,i,c['examples'])
                    train_arrays[f'{seed}-{split}-{i}-x']=x.numpy();train_arrays[f'{seed}-{split}-{i}-y']=y.numpy()
        np.savez_compressed(out/'training-datasets.npz',**train_arrays);files.append('training-datasets.npz')
    atomic_json(out/'model-card.json',dict(name='MaleCNS '+c['task']+' variant',status='confirmed on specified benchmark' if result['improved'] else 'experimental; improvement not established',
        sourceGraphSha256=graph.hashes['counts.npz'],task=c['task'],taskVersion=task.version,
        mutationHistory=state['best']['program'] if state['best'] else [],evaluation=confirmation,
        limitations=['Engineered rate dynamics, not measured physiology','Task-specific evidence only','Timing depends on hardware','Anatomical geometry for added neurons is not reconstructed'],
        publication='This is an export for review, not an automatic public upload. Retain source dataset attribution and verify its redistribution terms.'))
    files.append('model-card.json')
    for name in ('selection.json','test-datasets.npz'):
        if (out/name).exists():files.append(name)
    source_files=('discovery.py','discovery_tasks.py','discovery_contract.py','discovery_model.py','model.py','engine.py','protocol.py','replay_discovery.py')
    (out/'source').mkdir(exist_ok=True)
    for f in source_files:
        (out/'source'/f).write_bytes(Path(__file__).with_name(f).read_bytes());files.append('source/'+f)
    atomic_json(out/'manifest.json',dict(schema='malecns-variant-bundle/1',files=[dict(name=f,sha256=digest(out/f)) for f in files]))
    with zipfile.ZipFile(out/'variant-bundle.zip.tmp','w',zipfile.ZIP_DEFLATED) as z:
        for f in files+['manifest.json']:z.write(out/f,f)
    (out/'variant-bundle.zip.tmp').replace(out/'variant-bundle.zip')
    atomic_json(out/'artifacts.json',[dict(name=f,sha256=digest(out/f),bytes=(out/f).stat().st_size) for f in ('result.json','variant-bundle.zip')])
    return result
