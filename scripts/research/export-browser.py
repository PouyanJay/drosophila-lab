"""Export the retained observed MaleCNS graph, without subsampling, for Web Workers."""
import json, hashlib, pathlib, sys
import numpy as np
from scipy.sparse import load_npz
root=pathlib.Path(__file__).resolve().parents[2]
source=pathlib.Path(sys.argv[1])
out=root/'public/research/browser';out.mkdir(parents=True,exist_ok=True)
graph=json.loads((root/'public/research/graph.json').read_text())
counts=load_npz(source/'counts.npz').tocsr()
neurons=np.load(source/'neurons.npz')
files={}
for name, data in [('indices',counts.indices.astype('<u4')),('weights',counts.data.astype('<f4')),('indptr',counts.indptr.astype('<u4')),('classes',neurons['classes'].astype('<u4')),('signs',neurons['signs'].astype('<f4')),('ids',neurons['ids'].astype('<f8'))]:
    raw=data.tobytes();files[name]=[]
    for i,offset in enumerate(range(0,len(raw),8*1024*1024)):
        part=raw[offset:offset+8*1024*1024];file=f'{name}-{i}.bin';(out/file).write_bytes(part)
        files[name].append({'file':file,'bytes':len(part),'sha256':hashlib.sha256(part).hexdigest()})
manifest={**graph,'schema':'malecns-browser-graph/1','layout':'CSR target rows, source indices; unsigned observed counts. Apply source transmitter signs at compilation.','files':files}
(out/'manifest.json').write_text(json.dumps(manifest))
print(json.dumps({'neurons':counts.shape[0],'edges':counts.nnz,'bytes':sum(p['bytes'] for ps in files.values() for p in ps)}))
