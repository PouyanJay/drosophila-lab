"""Build a sparse graph from every Traced MaleCNS neuron, without coordinate filtering."""
import argparse,json,hashlib,urllib.request
from pathlib import Path
import numpy as np
import scipy.sparse as sp
import pyarrow.feather as feather
NAMES=['body-annotations-male-cns-v1.0-minconf-0.5.feather','body-neurotransmitters-male-cns-v1.0.feather','connectome-weights-male-cns-v1.0-minconf-0.5.feather']
BASE='https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/'
def prepare(raw,out,min_synapses=5):
 raw=Path(raw);out=Path(out);raw.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
 for name in NAMES:
  if not (raw/name).exists():
   print('Downloading',name,flush=True);urllib.request.urlretrieve(BASE+name,raw/(name+'.partial'));(raw/(name+'.partial')).rename(raw/name)
 a=feather.read_table(raw/NAMES[0]).to_pandas();a=a[a.status=='Traced'].sort_values('bodyId').copy();ids=a.bodyId.to_numpy(dtype=np.int64);n=len(ids)
 labels=sorted(a.superclass.fillna('unclassified').unique());classes=np.array([labels.index(x) for x in a.superclass.fillna('unclassified')],dtype=np.int32)
 nt=feather.read_table(raw/NAMES[1]).to_pandas().set_index('body').consensus_nt
 signs=np.array([-1 if nt.get(int(i))=='gaba' else 1 for i in ids],dtype=np.float32)
 w=feather.read_table(raw/NAMES[2],memory_map=True);rows=[];cols=[];weights=[]
 for b in w.to_batches(max_chunksize=1000000):
  pre=b.column(0).to_numpy();post=b.column(1).to_numpy();v=b.column(2).to_numpy();p=np.searchsorted(ids,pre);q=np.searchsorted(ids,post)
  ok=(p<n)&(q<n)&(v>=min_synapses);ok&=(ids[np.minimum(p,n-1)]==pre)&(ids[np.minimum(q,n-1)]==post)
  rows.append(q[ok].astype(np.int32));cols.append(p[ok].astype(np.int32));weights.append(v[ok].astype(np.float32))
 mat=sp.csr_matrix((np.concatenate(weights),(np.concatenate(rows),np.concatenate(cols))),shape=(n,n));mat.sum_duplicates();mat.sort_indices()
 sp.save_npz(out/'counts.npz',mat);np.savez_compressed(out/'neurons.npz',ids=ids,classes=classes,signs=signs)
 classcounts=np.bincount(classes,minlength=len(labels));coo=mat.tocoo();block=np.zeros((len(labels),len(labels)),dtype=np.float64);np.add.at(block,(classes[coo.col],classes[coo.row]),coo.data)
 def digest(path):
  h=hashlib.sha256()
  with open(path,'rb') as f:
   for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
  return h.hexdigest()
 manifest={'schema':'malecns-full-graph/1','dataset':'male-cns:v1.0','neurons':n,'edges':mat.nnz,'synapses':int(mat.sum()),'minSynapses':min_synapses,'filter':'All annotation rows with status Traced; no coordinate or class requirement. Retain every node, including isolated nodes. Directed edges between retained nodes with at least '+str(min_synapses)+' observed synapses.','classes':labels,'classCounts':classcounts.tolist(),'classConnectivity':block.astype(np.int64).tolist(),'graphSha256':digest(out/'counts.npz'),'sourceFiles':[{'file':x,'url':BASE+x,'sha256':digest(raw/x)} for x in NAMES],'license':'CC BY 4.0','signModel':'Consensus GABA negative; all other and unknown transmitters positive. Simplification, not receptor inference.'}
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2));print(json.dumps({k:manifest[k] for k in ['neurons','edges','synapses','graphSha256']}),flush=True)
 return manifest
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--raw',default='data/raw');p.add_argument('--out',default='data/full');p.add_argument('--min-synapses',type=int,default=5);a=p.parse_args();prepare(a.raw,a.out,a.min_synapses)
