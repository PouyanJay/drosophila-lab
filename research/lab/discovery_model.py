"""Explicit topology edits on the retained source connectome, never a replacement ANN."""
import hashlib
from types import SimpleNamespace
import numpy as np
import scipy.sparse as sp
import torch
from torch import nn
from .model import FlyNetwork,EdgeMultiply

def structural_graph(graph, program, population):
    counts=graph.counts.copy();data={k:v.copy() for k,v in graph.data.items()}
    original=counts.shape[0];ancestors=[];edits=[];copy_sources=[]
    eligible=np.flatnonzero(data['classes']==graph.manifest['classes'].index(population))
    strength=np.asarray(counts.sum(0)).ravel()+np.asarray(counts.sum(1)).ravel()
    pool=eligible[np.argsort(-strength[eligible],kind='stable')][:128]
    if not len(pool):raise ValueError('Source population is empty')
    for event in program:
        rng=np.random.default_rng(event['seed']);chosen=rng.choice(pool,min(event['count'],len(pool)),replace=False)
        if event['operator']!='rewire':
            n=counts.shape[0];cols=counts[:,chosen].copy();rows=counts[chosen,:].copy()
            cols.data*=rng.uniform(.35,1.65,len(cols.data));rows.data*=rng.uniform(.35,1.65,len(rows.data))
            corner=counts[chosen,:][:,chosen].copy()
            if event['operator']=='recurrent-loop':
                corner=corner+sp.eye(len(chosen),format='csr')*max(1.,float(counts.data.mean())*4)
            counts=sp.bmat([[counts,cols],[rows,corner]],format='csr')
            for offset,i in enumerate(chosen):
                ancestors.append(str(graph.data['ids'][i]));edits.append(dict(kind='added-neuron',index=n+offset,sourceBody=str(graph.data['ids'][i]),operator=event['operator']))
                copy_sources.append(int(i))
            data['classes']=np.r_[data['classes'],data['classes'][chosen]]
            data['signs']=np.r_[data['signs'],data['signs'][chosen]]
            data['ids']=np.r_[data['ids'],np.arange(int(data['ids'].max())+1,int(data['ids'].max())+1+len(chosen),dtype=data['ids'].dtype)]
        else:
            # Reassign one actual incoming edge for each selected postsynaptic row.
            sensory=np.flatnonzero(np.array(['sensory' in graph.manifest['classes'][int(k)] for k in data['classes']]))
            if not len(sensory):sensory=pool
            for row in chosen:
                begin,end=counts.indptr[row:row+2]
                if begin==end:continue
                k=int(rng.integers(begin,end));before=int(counts.indices[k]);after=int(rng.choice(sensory))
                counts.indices[k]=after
                edits.append(dict(kind='rewired-edge',row=int(row),before=before,after=after,weight=float(counts.data[k])))
            counts.sum_duplicates();counts.sort_indices()
    counts.eliminate_zeros();counts.sort_indices()
    h=hashlib.sha256()
    for a in (counts.indptr,counts.indices,counts.data):h.update(a.tobytes())
    # Identical source-anchored readout size for baseline and candidate. Copies
    # inherit their parent's probe membership; class averages alone dilute them.
    probe_nodes=list(map(int,pool))+list(range(original,counts.shape[0]))
    lookup={int(node):i for i,node in enumerate(pool)}
    probe_groups=list(range(len(pool)))+[lookup[i] for i in copy_sources]
    return SimpleNamespace(counts=counts,data=data,manifest=graph.manifest,hashes=graph.hashes,
        probe_nodes=probe_nodes,probe_groups=probe_groups,probe_count=len(pool)),dict(
        sourceNeurons=original,neurons=counts.shape[0],edges=counts.nnz,ancestors=ancestors,
        topologySha256=h.hexdigest(),program=program,edits=edits,
        readoutAnchors=[str(graph.data['ids'][i]) for i in pool],
        readoutRule='Class averages plus up to 128 fixed source-neuron probes. Descendant copies share their source probe by mean pooling. Identical head width in both architectures.')

class DiscoveryNetwork(FlyNetwork):
    def __init__(self, graph, task):
        super().__init__(graph)
        self.task=task
        self.encoder=nn.Parameter(torch.randn(self.c,task.input_channels)*.3)
        if not hasattr(graph,'probe_nodes'):
            graph,_=structural_graph(graph,[],'cb_intrinsic')
        self.probe_count=graph.probe_count
        self.register_buffer('probe_nodes',torch.tensor(graph.probe_nodes,dtype=torch.long))
        self.register_buffer('probe_groups',torch.tensor(graph.probe_groups,dtype=torch.long))
        self.register_buffer('probe_counts',torch.bincount(self.probe_groups,minlength=self.probe_count).float().clamp(min=1)[:,None])
        self.readout=nn.Linear(self.c+self.probe_count,task.classes)
        # Both baseline and candidate get identical parameterization. Copies can
        # develop independent dynamics instead of being forced into class symmetry.
        self.node_bias=nn.Parameter(torch.zeros(self.n))
        self.node_leak=nn.Parameter(torch.zeros(self.n))
    def forward(self,x,ablate=False):
        h=torch.zeros(self.n,x.shape[1],dtype=x.dtype)
        values=self.base_values*(2*torch.sigmoid(self.edge_scale))
        leak=torch.sigmoid(self.leak[self.classes]+self.node_leak)[:,None]
        gain=(.3+1.4*torch.sigmoid(self.gain))[self.classes,None]
        for t in range(len(x)):
            recurrent=torch.zeros_like(h) if ablate else EdgeMultiply.apply(h,values,self.indptr,self.indices,self.rows)
            sensory=(self.encoder*self.sensory)@x[t].T
            h=(1-leak)*h+leak*torch.tanh(gain*recurrent+sensory[self.classes]+self.bias[self.classes,None]+self.node_bias[:,None])
        pooled=torch.zeros(self.c,x.shape[1]).index_add(0,self.classes,h)/self.class_counts
        probes=torch.zeros(self.probe_count,x.shape[1]).index_add(0,self.probe_groups,h[self.probe_nodes])/self.probe_counts
        return self.readout(torch.cat([pooled,probes]).T)
