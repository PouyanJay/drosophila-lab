"""Re-evaluate a saved checkpoint against its held-out split; never trains."""
import argparse,json,hashlib,importlib.util
from pathlib import Path
import numpy as np
import scipy.sparse as sp
import torch
import runner
p=argparse.ArgumentParser();p.add_argument('checkpoint');p.add_argument('--graph',default='data/full');p.add_argument('--out',default='evaluation.json');a=p.parse_args();g=Path(a.graph);manifest=json.loads((g/'manifest.json').read_text());checkpoint=torch.load(a.checkpoint,weights_only=True,map_location='cpu')
if checkpoint['graphSha256']!=manifest['graphSha256'] or hashlib.sha256((g/'counts.npz').read_bytes()).hexdigest()!=manifest['graphSha256']:raise ValueError('Checkpoint graph mismatch')
engine=runner
if checkpoint['engine']=='malecns-recurrent/3.0':
 spec=importlib.util.spec_from_file_location('measured_v3',Path(__file__).parent/'versions/runner-v3.0.py');engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
config=checkpoint['config'];data=np.load(g/'neurons.npz');w=sp.load_npz(g/'counts.npz');torch.set_num_threads(4);model=engine.FlyModel(w,data['classes'],data['signs'],manifest['classes'],checkpoint['variant']);model.load_state_dict(checkpoint['state_dict']);seed=int(Path(a.checkpoint).stem.split('-seed-')[-1]);x,y=engine.dataset(30000+seed,config['testExamples'],config['sequenceLength'],config['task']);normal=engine.evaluate(model,x,y,config['batch']);ablated=engine.evaluate(model,x,y,config['batch'],True);result={'checkpoint':Path(a.checkpoint).name,'checkpointSha256':hashlib.sha256(Path(a.checkpoint).read_bytes()).hexdigest(),'graphSha256':manifest['graphSha256'],'test':normal,'backboneOff':ablated};Path(a.out).write_text(json.dumps(result,indent=2));print(json.dumps({'testAccuracy':normal['accuracy'],'backboneOffAccuracy':ablated['accuracy']}))
