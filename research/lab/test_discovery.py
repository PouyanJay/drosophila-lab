import copy,json,tempfile,unittest,zipfile,hashlib,time
from pathlib import Path
from unittest.mock import patch
import numpy as np
import torch
from fastapi.testclient import TestClient
from .test_lab import fixture
from .discovery_contract import DEFAULT,validate
from .discovery_tasks import TASKS,Task
from .discovery_model import structural_graph,DiscoveryNetwork
from .discovery import run,train_member
from .replay_discovery import replay
from .engine import Interrupted
from .service import Store,create_app

def config(task='cue-memory'):
    return dict(copy.deepcopy(DEFAULT),task=task,delays=[1,3],noise=[.1],lengths=[2],
        candidates=2,maxCopies=2,pilotUpdates=1,fullUpdates=2,confirmationUpdates=2,
        examples=8,maxSeconds=60,minimumGain=.001)

class DiscoveryChecks(unittest.TestCase):
    def test_task_split_contracts(self):
        for name,t in TASKS.items():
            c=config(name)
            for i,s in enumerate(t.scenarios(c)):
                x,y=t.generate(c,41,'train',i,8);again,_=t.generate(c,41,'train',i,8)
                self.assertTrue(torch.equal(x,again));self.assertEqual(x.shape[-1],t.input_channels)
                self.assertEqual(y.bincount().tolist(),[2,2,2,2])
                different,_=t.generate(c,41,'test',i,8);self.assertFalse(torch.equal(x,different))
    def test_actual_topology_and_forward_changes(self):
        with tempfile.TemporaryDirectory() as d:
            g=fixture(d);before=g.counts.copy()
            for op in ('duplicate-diverge','recurrent-loop','rewire'):
                p=[dict(operator=op,count=2,seed=19)];modified,meta=structural_graph(g,p,'cb_intrinsic')
                self.assertEqual((g.counts!=before).nnz,0)
                task=TASKS['cue-memory'];x,y=task.generate(config(),41,'train',0,8)
                torch.manual_seed(41);base=DiscoveryNetwork(g,task)
                torch.manual_seed(41);candidate=DiscoveryNetwork(modified,task)
                self.assertGreater(float((base(x)-candidate(x)).abs().max()),1e-8)
                loss=torch.nn.functional.cross_entropy(candidate(x),y);loss.backward()
                self.assertGreater(float(candidate.edge_scale.grad.abs().sum()),0)
                if op!='rewire':self.assertGreater(float(candidate.node_bias.grad[-2:].abs().sum()),0)
                self.assertTrue(meta['edits'])
    def test_same_worker_runs_multiple_tasks_and_writes_honest_bundles(self):
        with tempfile.TemporaryDirectory() as d:
            g=fixture(Path(d)/'source')
            for task in TASKS:
                out=Path(d)/task;result=run(config(task),g,out,threads=1)
                self.assertEqual(result['task'],task);self.assertEqual(len(result['candidates']),2)
                self.assertEqual(result['improved'],bool(result['confirmation'] and result['confirmation']['accepted']))
                with zipfile.ZipFile(out/'variant-bundle.zip') as z:
                    manifest=json.loads(z.read('manifest.json'))
                    for item in manifest['files']:self.assertEqual(hashlib.sha256(z.read(item['name'])).hexdigest(),item['sha256'])
                if result['best']:
                    self.assertTrue((out/'variant-counts.npz').exists())
                    self.assertTrue(list((out/result['best']['id']/'full').glob('*/best.pt')))
    def test_interruption_resume_is_reproducible(self):
        with tempfile.TemporaryDirectory() as d:
            g=fixture(Path(d)/'source');c=config();count=0
            def interrupt():
                nonlocal count
                count+=1
                if count==12:raise Interrupted()
            with self.assertRaises(Interrupted):run(c,g,Path(d)/'resume',control=interrupt,threads=1)
            resumed=run(c,g,Path(d)/'resume',threads=1);fresh=run(c,g,Path(d)/'fresh',threads=1)
            self.assertEqual(resumed['candidates'],fresh['candidates']);self.assertEqual(resumed['outcome'],fresh['outcome'])
            with self.assertRaises(ValueError):run(dict(c,examples=12),g,Path(d)/'resume',threads=1)
    def test_time_budget_is_a_valid_outcome(self):
        with tempfile.TemporaryDirectory() as d:
            g=fixture(Path(d)/'source');clock=iter(range(0,10000,100))
            with patch('research.lab.discovery.time.monotonic',side_effect=lambda:next(clock)):
                result=run(config(),g,Path(d)/'run',threads=1)
            self.assertEqual(result['outcome'],'time_budget');self.assertFalse(result['improved'])
    def test_owner_scoping_and_idempotency(self):
        with tempfile.TemporaryDirectory() as d:
            g=fixture(Path(d)/'source');store=Store(Path(d)/'runs')
            with TestClient(create_app(store,g,key='x'*32,start_executor=False)) as client:
                headers={'Authorization':'Bearer '+'x'*32,'X-Lab-Owner':'a'*64}
                body=dict(config=config(),requestKey='test-discovery-key')
                a=client.post('/discoveries',json=body,headers=headers);self.assertEqual(a.status_code,200)
                id=a.json()['id'];self.assertEqual(client.post('/discoveries',json=body,headers=headers).json()['id'],id)
                self.assertEqual(client.get('/discoveries/'+id,headers=dict(headers,**{'X-Lab-Owner':'b'*64})).status_code,404)
                self.assertEqual(client.get('/jobs',headers=headers).json()['jobs'],[])
                self.assertEqual(len(client.get('/discovery-tasks',headers=headers).json()['tasks']),3)
                self.assertEqual(client.post('/discoveries',headers=headers,json=dict(body,config=dict(config(),task='invented'))).status_code,400)
    def test_custom_regression_adapter_uses_unmodified_search(self):
        class Regression(Task):
            def validate_parameters(self,p):
                if set(p)!={'amplitude'} or not 0<p['amplitude']<=1:raise ValueError('Specify amplitude in (0,1]')
            def scenarios(self,c):return [dict(amplitude=json.loads(c['taskParameters'])['amplitude'])]
            def generate(self,c,seed,split,i,count):
                domain=['train','validation','confirmation-train','confirmation-validation','test'].index(split)
                rng=np.random.default_rng(np.random.SeedSequence([seed,domain]))
                x=torch.tensor(rng.uniform(-1,1,(3,count,2)),dtype=torch.float32)
                return x,x[0,:,0:1]*self.scenarios(c)[i]['amplitude']
            def loss(self,z,y):return torch.nn.functional.mse_loss(z,y)
            def score(self,z,y):return float(1/(1+self.loss(z,y)))
            def decode(self,z):return z.tolist()
            def probabilities(self,z):return []
        task=Regression('regression-check','Continuous recall',input_channels=2,classes=1,metric_name='Normalized recall score')
        with tempfile.TemporaryDirectory() as d,patch.dict(TASKS,{task.id:task}):
            g=fixture(Path(d)/'source');c=dict(config(task.id),taskParameters='{"amplitude":0.5}')
            validate(c);r=run(c,g,Path(d)/'run',threads=1)
            self.assertEqual(r['metricName'],task.metric_name);self.assertTrue(r['candidates'])
            self.assertTrue(replay(g,Path(d)/'run')['verifiedArtifacts'])

    def test_finalist_is_frozen_before_tests_and_replays(self):
        # Force only validation ranking to exercise the final phase regardless of
        # fixture difficulty. Training, held-out measurements and replay stay real.
        with tempfile.TemporaryDirectory() as d:
            g=fixture(Path(d)/'source');out=Path(d)/'run';task=TASKS['cue-memory']
            original_generate=Task.generate;test_calls=[]
            def fit(*args,**kwargs):
                row=copy.deepcopy(train_member(*args,**kwargs))
                if args[3] and args[6] in ('pilot','full'):
                    row['validation']['accuracy']=1.;row['validation']['loss']=0.
                return row
            def generate(t,c,seed,split,i,count):
                if split=='test':
                    self.assertTrue((out/'selection.json').exists());test_calls.append(seed)
                return original_generate(t,c,seed,split,i,count)
            with patch('research.lab.discovery.train_member',side_effect=fit),patch.object(Task,'generate',generate):
                r=run(config(),g,out,threads=1)
            self.assertTrue(test_calls);self.assertIsNotNone(r['confirmation'])
            self.assertEqual(replay(g,out)['replayed'],True)
            self.assertEqual(r['improved'],r['confirmation']['accepted'])
            (out/'variant.json').write_text('{}')
            with self.assertRaises(ValueError):replay(g,out)

    def test_service_runs_queued_discovery_and_reopens_artifact(self):
        with tempfile.TemporaryDirectory() as d:
            g=fixture(Path(d)/'source');directory=Path(d)/'runs';store=Store(directory)
            headers={'Authorization':'Bearer '+'x'*32,'X-Lab-Owner':'a'*64}
            row=store.submit('a'*64,'queued-discovery-test',config())
            store.transition(row['id'],'a'*64,'pause')
            with TestClient(create_app(store,g,key='x'*32)) as client:
                path='/discoveries/'+row['id']
                self.assertEqual(client.get(path,headers=headers).json()['status'],'paused')
                self.assertEqual(client.post(path+'/resume',headers=headers).status_code,200)
                deadline=time.monotonic()+30
                while time.monotonic()<deadline:
                    current=client.get(path,headers=headers).json()
                    if current['status'] in ('completed','failed'):break
                    time.sleep(.05)
                self.assertEqual(current['status'],'completed',current.get('error'))
                self.assertIn('result',current)
            # Reopen both the persisted queue and artifact through a new app instance.
            with TestClient(create_app(Store(directory),g,key='x'*32,start_executor=False)) as client:
                saved=client.get(path,headers=headers).json()
                self.assertEqual(saved['result'],current['result'])
                response=client.get(path+'/artifacts/variant-bundle.zip',headers=headers)
                self.assertEqual(response.status_code,200)
                self.assertEqual(hashlib.sha256(response.content).hexdigest(),response.headers['X-Artifact-SHA256'])

    def test_configuration_rejects_invalid_search(self):
        for key,value in [('noise',[float('nan')]),('seeds',[41,41,42]),('examples',9),('maxCopies',0),('task','arbitrary-game')]:
            with self.assertRaises(ValueError):validate(dict(config(),**{key:value}))

class DiscoveryCurveChecks(unittest.TestCase):
    def test_saved_curves_survive_service_reopen_and_match_worker_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            graph = fixture(root / 'source')
            store = Store(root / 'runs')
            row = store.submit('a' * 64, 'curve-history-test', config())
            output = store.root / row['id']
            run(config(), graph, output, threads=1)
            store.set(row['id'], 'completed')
            headers = {'Authorization': 'Bearer ' + 'x' * 32, 'X-Lab-Owner': 'a' * 64}
            with TestClient(create_app(Store(store.root), graph, key='x' * 32, start_executor=False)) as client:
                for candidate in ('original', 'candidate-0', 'candidate-1'):
                    path = f"/discoveries/{row['id']}/candidates/{candidate}/curves"
                    response = client.get(path, headers=headers)
                    self.assertEqual(response.status_code, 200)
                    data = response.json()
                    self.assertEqual(data['candidateId'], candidate)
                    self.assertGreater(len(data['runs']), 0)
                    for member in data['runs']:
                        saved = json.loads((output / candidate / member['phase'] / str(member['seed']) / 'metrics.json').read_text())
                        self.assertEqual(member['curve'], saved['curve'])
                        self.assertTrue(member['complete'])
                    self.assertIn('topology', data)
                    self.assertEqual(client.get(path, headers=dict(headers, **{'X-Lab-Owner': 'b' * 64})).status_code, 404)
                    self.assertEqual(client.get(path).status_code, 401)
                    self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_live_missing_invalid_and_unsafe_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            graph = fixture(root / 'source')
            store = Store(root / 'runs')
            row = store.submit('a' * 64, 'curve-live-test', config())
            candidate = store.root / row['id'] / 'candidate-0'
            member = candidate / 'pilot' / '41'
            member.mkdir(parents=True)
            curve = [{'step': 1, 'trainLoss': 1.2, 'validationLoss': 1.3, 'validationAccuracy': .25}]
            snapshot = member / 'training.json'
            snapshot.write_text(json.dumps({'curve': curve}))
            headers = {'Authorization': 'Bearer ' + 'x' * 32, 'X-Lab-Owner': 'a' * 64}
            prefix = f"/discoveries/{row['id']}/candidates/"
            with TestClient(create_app(store, graph, key='x' * 32, start_executor=False)) as client:
                response = client.get(prefix + 'candidate-0/curves', headers=headers)
                self.assertEqual(response.json()['runs'], [dict(phase='pilot', seed=41, curve=curve, complete=False)])
                for invalid in ('candidate-1', 'candidate-2', 'candidate-999', 'candidate-00', 'arbitrary'):
                    self.assertEqual(client.get(prefix + invalid + '/curves', headers=headers).status_code, 404)
                snapshot.write_text('{broken')
                self.assertEqual(client.get(prefix + 'candidate-0/curves', headers=headers).status_code, 503)
                snapshot.unlink()
                outside = root / 'private.json'
                outside.write_text(json.dumps({'curve': curve}))
                snapshot.symlink_to(outside)
                self.assertEqual(client.get(prefix + 'candidate-0/curves', headers=headers).status_code, 404)
                snapshot.unlink()
                self.assertEqual(client.get(prefix + 'candidate-0/curves', headers=headers).json()['runs'], [])


if __name__=='__main__':unittest.main()
