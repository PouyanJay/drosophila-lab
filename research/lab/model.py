"""Sparse rate model. Measured topology; explicitly engineered dynamics."""
import numpy as np
import scipy.sparse as sp
import torch
from torch import nn

class EdgeMultiply(torch.autograd.Function):
    """CPU CSR matmul with exact first derivatives for all observed edge values.

    Bounded chunks avoid an E x batch intermediate for the entire graph.
    Topology arrays are immutable. Supports first-order optimization only.
    """
    @staticmethod
    def forward(ctx, x, values, indptr, indices, rows):
        w = sp.csr_matrix((values.detach().numpy(), indices, indptr), shape=(len(indptr)-1,)*2)
        ctx.save_for_backward(x, values)
        ctx.topology = (indptr, indices, rows)
        return torch.from_numpy(w @ x.detach().numpy())

    @staticmethod
    def backward(ctx, grad):
        x, values = ctx.saved_tensors
        indptr, indices, rows = ctx.topology
        g, a = grad.contiguous().numpy(), x.detach().numpy()
        w = sp.csr_matrix((values.detach().numpy(), indices, indptr), shape=(len(indptr)-1,)*2)
        dx = torch.from_numpy(w.T @ g) if ctx.needs_input_grad[0] else None
        dv = np.empty(len(indices), dtype=a.dtype)
        for k in range(0, len(indices), 131072):
            stop = min(k+131072, len(indices))
            dv[k:stop] = np.einsum('ij,ij->i', g[rows[k:stop]], a[indices[k:stop]])
        return dx, torch.from_numpy(dv), None, None, None

class FlyNetwork(nn.Module):
    def __init__(self, graph, duplicates=0, population='cb_intrinsic'):
        super().__init__()
        counts, data, labels = graph.counts, graph.data, graph.manifest['classes']
        self.biological_n = counts.shape[0]
        classes, signs = data['classes'].copy(), data['signs'].copy()
        chosen = np.array([], dtype=np.int64)
        if duplicates:
            eligible = np.flatnonzero(classes == labels.index(population))
            strength = np.asarray(counts.sum(axis=0)).ravel()+np.asarray(counts.sum(axis=1)).ravel()
            chosen = eligible[np.argsort(-strength[eligible], kind='stable')][:duplicates]
            if len(chosen) != duplicates:
                raise ValueError('Not enough source neurons in this population')
            counts = sp.bmat([[counts, counts[:,chosen]], [counts[chosen,:], counts[chosen,:][:,chosen]]], format='csr')
            classes = np.concatenate([classes, classes[chosen]])
            signs = np.concatenate([signs, signs[chosen]])
        self.ancestors = [str(data['ids'][i]) for i in chosen]
        self.n, self.c, self.edges = len(classes), len(labels), counts.nnz
        denominator = np.asarray(counts.sum(axis=1)).ravel()
        w = (sp.diags(.95/np.maximum(denominator,1)) @ counts).tocsr().astype(np.float32)
        w.sort_indices()
        w.data *= signs[w.indices]
        self.indptr, self.indices = w.indptr.copy(), w.indices.copy()
        self.rows = np.repeat(np.arange(self.n), np.diff(w.indptr))
        self.register_buffer('base_values', torch.from_numpy(w.data.copy()))
        self.register_buffer('classes', torch.from_numpy(classes.astype(np.int64)))
        self.register_buffer('class_counts', torch.bincount(self.classes, minlength=self.c).float().clamp(min=1)[:,None])
        self.register_buffer('sensory', torch.tensor([float('sensory' in s) for s in labels])[:,None])
        # Initialize common parameters before edge parameters: paired models start identically.
        self.encoder = nn.Parameter(torch.randn(self.c,2)*.3)
        self.gain = nn.Parameter(torch.zeros(self.c))
        self.leak = nn.Parameter(torch.full((self.c,),-.85))
        self.bias = nn.Parameter(torch.zeros(self.c))
        self.readout = nn.Linear(self.c,1)
        self.edge_scale = nn.Parameter(torch.zeros(self.edges))

    def forward(self, x, ablate=False):
        h = torch.zeros(self.n, x.shape[1], dtype=x.dtype)
        values = self.base_values * (2*torch.sigmoid(self.edge_scale))
        leak = torch.sigmoid(self.leak)[self.classes,None]
        gain = (.3+1.4*torch.sigmoid(self.gain))[self.classes,None]
        for t in range(len(x)):
            recurrent = torch.zeros_like(h) if ablate else EdgeMultiply.apply(h, values, self.indptr, self.indices, self.rows)
            sensory = (self.encoder*self.sensory) @ x[t].T
            h = (1-leak)*h + leak*torch.tanh(gain*recurrent+sensory[self.classes]+self.bias[self.classes,None])
        pooled = torch.zeros(self.c, x.shape[1]).index_add(0,self.classes,h)/self.class_counts
        return self.readout(pooled.T).squeeze(-1)
