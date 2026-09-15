import hashlib, json
from pathlib import Path
import numpy as np
import scipy.sparse as sp
import torch

ENGINE = 'malecns-synaptic-lab/1.0'
GRAPH_SHA = '729b2b60c7759ead12163cc30daa2b8a3abf8565f0f5773f19fde20cfaa14f7b'
DEFAULT = dict(schema='malecns-lab/1',task='cue-memory',duplicates=32,population='cb_intrinsic',seeds=[41,42,43],updates=12,batch=4,timesteps=8,trainExamples=32,validationExamples=16,testExamples=32,learningRate=.01)

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',',':'), allow_nan=False)

def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''): h.update(block)
    return h.hexdigest()

def validate(config):
    if set(config)!=set(DEFAULT): raise ValueError('Configuration fields do not match malecns-lab/1')
    if config['schema']!='malecns-lab/1' or config['task'] not in ('cue-memory','noisy-evidence'): raise ValueError('Unsupported task or schema')
    for name,low,high in [('duplicates',0,128),('updates',1,200),('batch',1,8),('timesteps',4,16),('trainExamples',8,512),('validationExamples',8,256),('testExamples',8,512)]:
        if type(config[name]) is not int or not low<=config[name]<=high: raise ValueError('Invalid '+name)
    if any(config[k]%2 for k in ('trainExamples','validationExamples','testExamples')): raise ValueError('Balanced splits need even sample counts')
    if config['population'] not in ('cb_intrinsic','descending_neuron','visual_projection'): raise ValueError('Unsupported population')
    if type(config['learningRate']) not in (int,float) or not 0<config['learningRate']<=.05: raise ValueError('Invalid learning rate')
    s=config['seeds']
    if not isinstance(s,list) or not 1<=len(s)<=5 or any(type(i) is not int or not 0<=i<=9999 for i in s) or len(set(s))!=len(s): raise ValueError('Invalid seeds')
    return config

class Graph:
    def __init__(self, directory):
        p=Path(directory)
        self.manifest=json.loads((p/'manifest.json').read_text())
        self.hashes={n:digest(p/n) for n in ('counts.npz','neurons.npz','manifest.json')}
        if self.hashes['counts.npz']!=self.manifest['graphSha256']: raise ValueError('Graph checksum mismatch')
        self.counts=sp.load_npz(p/'counts.npz').astype(np.float32)
        with np.load(p/'neurons.npz',allow_pickle=False) as d: self.data={k:d[k].copy() for k in ('classes','signs','ids')}
        if len(self.data['ids'])!=self.counts.shape[0] or self.counts.nnz!=self.manifest['edges']: raise ValueError('Graph metadata mismatch')

def dataset(config, seed, split):
    # A SeedSequence domain per split avoids overlapping streams, regardless of seed list.
    rng=np.random.default_rng(np.random.SeedSequence([seed, {'train':1,'validation':2,'test':3}[split], 20260913]))
    count=config[{'train':'trainExamples','validation':'validationExamples','test':'testExamples'}[split]]
    y=np.tile([0,1],count//2).astype(np.float32);rng.shuffle(y)
    x=np.zeros((config['timesteps'],count,2),np.float32)
    if config['task']=='cue-memory':
        x[:,:,0]=rng.normal(0,.15,(len(x),count))
        x[0,:,0]=y*2-1
        x[0,:,1]=1
    else:
        x[:,:,0]=(y*2-1)[None,:]+rng.normal(0,1.6,(len(x),count))
        x[:,:,1]=1
    return torch.from_numpy(x),torch.from_numpy(y)

def code_hash():
    h=hashlib.sha256()
    for name in ('model.py','protocol.py','engine.py'):
        h.update(name.encode());h.update(Path(__file__).with_name(name).read_bytes())
    return h.hexdigest()
