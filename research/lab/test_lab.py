import copy, hashlib, json, tempfile, unittest
from pathlib import Path
import numpy as np
import scipy.sparse as sp
import torch
from fastapi.testclient import TestClient
from .protocol import DEFAULT, Graph, digest, dataset, validate
from .model import EdgeMultiply, FlyNetwork
from .engine import run, replay, Interrupted
from .service import Store, create_app

def fixture(root):
    root=Path(root);root.mkdir(parents=True,exist_ok=True)
    counts=sp.csr_matrix(np.array([[0,5,8,0],[7,0,11,0],[0,13,0,9],[5,0,3,0]],np.float32))
    sp.save_npz(root/'counts.npz',counts)
    np.savez_compressed(root/'neurons.npz',classes=np.array([0,1,1,1]),signs=np.array([1,-1,1,1],np.float32),ids=np.arange(4)+100)
    (root/'manifest.json').write_text(json.dumps(dict(graphSha256=digest(root/'counts.npz'),classes=['cb_sensory','cb_intrinsic'],edges=counts.nnz)))
    return Graph(root)

class Checks(unittest.TestCase):
    def test_sparse_derivatives(self):
        w=sp.csr_matrix(np.array([[0,2,-1],[.7,0,0],[0,-.3,0]],np.float64));rows=np.repeat(np.arange(3),np.diff(w.indptr));x=torch.randn(3,2,dtype=torch.float64,requires_grad=True);v=torch.tensor(w.data,requires_grad=True)
        self.assertTrue(torch.autograd.gradcheck(lambda x,v:EdgeMultiply.apply(x,v,w.indptr,w.indices,rows),(x,v)))
        a=EdgeMultiply.apply(x,v,w.indptr,w.indices,rows);dense=torch.zeros(3,3,dtype=torch.float64).index_put((torch.tensor(rows),torch.tensor(w.indices)),v);torch.testing.assert_close(a,dense@x)
    def test_topology_and_learning(self):
        with tempfile.TemporaryDirectory() as d:
            g=fixture(d);before=g.counts.copy();m=FlyNetwork(g,1);self.assertEqual(m.n,5);self.assertEqual((g.counts!=before).nnz,0);self.assertEqual(len(m.ancestors),1)
            x,y=dataset(DEFAULT,41,'train');torch.nn.functional.binary_cross_entropy_with_logits(m(x),y).backward()
            for name in ('edge_scale','gain','leak','encoder'):
                self.assertGreater(float(getattr(m,name).grad.abs().sum()),0)
    def test_repeat_resume_replay(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);g=fixture(root/'graph');c={**DEFAULT,'duplicates':1,'seeds':[41],'updates':3,'trainExamples':8,'validationExamples':8,'testExamples':8}
            a=run(c,g,root/'a');b=run(c,g,root/'b')
            def stop(p):
                if p.get('completedUpdates')==1: raise Interrupted()
            with self.assertRaises(Interrupted):run(c,g,root/'resume',progress=stop)
            resumed=run(c,g,root/'resume')
            for vi in (0,1):
                for other in (b,resumed):
                    self.assertEqual(a['models'][vi]['runs'][0]['parameterSha256'],other['models'][vi]['runs'][0]['parameterSha256'])
                    self.assertEqual(a['models'][vi]['runs'][0]['history'],other['models'][vi]['runs'][0]['history'])
                    self.assertEqual(a['models'][vi]['runs'][0]['test'],other['models'][vi]['runs'][0]['test'])
            self.assertTrue(replay(g,root/'a')['verified'])
            with self.assertRaises(ValueError):run({**c,'updates':4},g,root/'resume')
            (root/'a'/'config.json').write_text('{}')
            with self.assertRaises(ValueError):replay(g,root/'a')
    def test_api_ownership_and_transitions(self):
        with tempfile.TemporaryDirectory() as d:
            g=fixture(Path(d)/'graph');store=Store(Path(d)/'jobs');key='x'*40;app=create_app(store,g,key,start_executor=False)
            with TestClient(app) as client:
                self.assertEqual(client.get('/health').status_code,401)
                client.headers.update({'Authorization':'Bearer '+key,'X-Lab-Owner':'a'*64})
                self.assertEqual(client.get('/health').status_code,200)
                payload={'requestKey':'request-one','config':{**DEFAULT,'duplicates':1}}
                a=client.post('/jobs',json=payload);self.assertEqual(a.status_code,200);id=a.json()['id']
                self.assertEqual(client.post('/jobs',json=payload).json()['id'],id)
                self.assertEqual(client.post('/jobs',json={**payload,'config':{**payload['config'],'updates':4}}).status_code,409)
                self.assertEqual(client.post('/jobs/'+id+'/pause').json()['status'],'paused')
                self.assertEqual(client.post('/jobs/'+id+'/resume').json()['status'],'queued')
                client.headers['X-Lab-Owner']='b'*64
                self.assertEqual(client.get('/jobs').json()['jobs'],[])
                self.assertEqual(client.get('/jobs/'+id).status_code,404)
                self.assertEqual(client.post('/jobs/'+id+'/cancel').status_code,404)
                client.headers['X-Lab-Owner']='a'*64
                self.assertEqual(client.post('/jobs/'+id+'/cancel').json()['status'],'cancelled')
                self.assertEqual(client.post('/jobs/'+id+'/resume').status_code,409)
                self.assertEqual(client.post('/jobs',content='x'*9000).status_code,413)

if __name__=='__main__':unittest.main()
