"""Verify a discovery export and replay recorded decisions on its actual test arrays."""
import argparse,json
from pathlib import Path
import numpy as np
import torch
from .protocol import Graph,digest
from .discovery_tasks import get_task
from .discovery_model import structural_graph,DiscoveryNetwork
from .discovery import measure,discovery_code_hash
from .engine import parameter_hash

def replay(graph,directory):
    root=Path(directory);manifest=json.loads((root/'manifest.json').read_text())
    for entry in manifest['files']:
        p=(root/entry['name']).resolve()
        if not p.is_relative_to(root.resolve()) or digest(p)!=entry['sha256']:raise ValueError('Bundle checksum mismatch')
    result=json.loads((root/'result.json').read_text());identity=json.loads((root/'identity.json').read_text())
    if graph.hashes!=identity['graph']:raise ValueError('Source graph mismatch')
    if discovery_code_hash()!=identity['codeSha256']:raise ValueError('Use the exported worker source for exact replay')
    if str(torch.__version__)!=identity['torch'] or np.__version__!=identity['numpy']:raise ValueError('Use the recorded library versions for exact replay')
    if not result['confirmation']:return dict(verifiedArtifacts=True,replayed=False,reason='No completed sealed-test evaluation; this variant is experimental')
    c=result['config'];task=get_task(c['task']);best=result['best'];torch.set_num_threads(identity['threads'])
    torch.use_deterministic_algorithms(True)
    with np.load(root/'test-datasets.npz',allow_pickle=False) as data:
        for row in result['confirmation']['runs']:
            seed=row['seed'];test=[(torch.from_numpy(data[f'{seed}-{i}-x']),torch.from_numpy(data[f'{seed}-{i}-y'])) for i in range(len(task.scenarios(c)))]
            for label,program,key in [('original',[],'original'),(best['id'],best['program'],'candidate')]:
                g,_=structural_graph(graph,program,c['population']);torch.manual_seed(seed);model=DiscoveryNetwork(g,task)
                model.load_state_dict(torch.load(root/label/'confirmation'/str(seed)/'best.pt',weights_only=True)['state'])
                measured=measure(model,test)
                if measured['predictions']!=row[key]['predictions'] or parameter_hash(model)!=row[key]['parameterSha256']:raise ValueError('Recorded decisions do not replay')
    return dict(verifiedArtifacts=True,replayed=True,confirmed=result['improved'],seeds=len(result['confirmation']['runs']))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--graph',required=True);p.add_argument('--run',required=True);a=p.parse_args()
    print(json.dumps(replay(Graph(a.graph),a.run)))
