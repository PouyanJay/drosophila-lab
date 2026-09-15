"""Focused numerical and lineage checks for the research engine."""
import unittest
import numpy as np
import scipy.sparse as sp
import torch
from runner import FlyModel,SparseMultiply,dataset,validate
class ResearchChecks(unittest.TestCase):
 def test_sparse_gradient_and_direction(self):
  w=sp.csr_matrix(np.array([[0,2,-1],[.7,0,0],[0,-.3,0]],np.float32));x=torch.randn(3,2,requires_grad=True);ref=x.detach().clone().requires_grad_();a=SparseMultiply.apply(x,w,w.T.tocsr());b=torch.tensor(w.toarray())@ref
  torch.testing.assert_close(a,b);a.square().sum().backward();b.square().sum().backward();torch.testing.assert_close(x.grad,ref.grad)
 def test_inherited_topology_preserves_original(self):
  counts=sp.csr_matrix(np.array([[0,5,0],[7,0,11],[0,13,0]],np.float32));original=counts.copy();classes=np.array([0,0,1]);signs=np.array([-1,1,1],np.float32)
  m=FlyModel(counts,classes,signs,['descending_neuron','cb_sensory'],{'duplicates':1,'population':'descending_neuron','graft':0,'prune':0})
  self.assertEqual(m.biological_n,3);self.assertEqual(m.n,4);self.assertEqual(m.duplicate_indices,[1]);self.assertEqual((counts!=original).nnz,0);self.assertEqual(m.retained_biological_edges,4);self.assertEqual(m.edge_count,8)
  # After normalization, copied incoming and outgoing edges preserve signs and nonzero positions.
  self.assertTrue(np.allclose(m.w.toarray()[3,:3],m.w.toarray()[1,:3]));self.assertTrue(np.allclose(m.w.toarray()[:3,3],m.w.toarray()[:3,1]))
 def test_recurrence_receives_gradient(self):
  w=sp.csr_matrix(np.array([[0,5,2],[7,0,11],[0,13,0]],np.float32));m=FlyModel(w,np.array([0,1,1]),np.ones(3,np.float32),['cb_sensory','descending_neuron'],{'graft':8,'prune':0});x,y=dataset(7,8,6,'temporal-xor');torch.nn.functional.binary_cross_entropy_with_logits(m(x),y).backward()
  for p in [m.gain,m.leak,m.encoder,m.module.weight_hh,m.feedback.weight]:self.assertIsNotNone(p.grad);self.assertGreater(float(p.grad.abs().sum()),0)
if __name__=='__main__':unittest.main()
