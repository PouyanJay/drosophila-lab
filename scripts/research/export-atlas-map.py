"""Export compact source-copy previews using each engine's actual ranking rule."""
from pathlib import Path
import json
import numpy as np
root=Path(__file__).resolve().parents[2]
public=root/'public'
manifest=json.loads((public/'research/browser/manifest.json').read_text())
ancestry=json.loads((public/'research/ancestry.json').read_text())
assert ancestry['graphSha256']==manifest['graphSha256']
catalog={str(x[0]):x for x in json.loads((public/'malecns/neurons.json').read_text())}
ids=np.fromfile(public/'research/browser/ids-0.bin',dtype='<f8')
classes=np.fromfile(public/'research/browser/classes-0.bin',dtype='<u4')
ptr=np.fromfile(public/'research/browser/indptr-0.bin',dtype='<u4')
degree=np.diff(ptr).astype(np.int64)
output={'graphSha256':manifest['graphSha256'],'lab':{},'browser':{},'positions':{}}
for population in ['cb_intrinsic','descending_neuron','visual_projection']:
 output['lab'][population]=[row['bodyId'] for row in ancestry['populations'][population]['0']]
 eligible=np.flatnonzero(classes==manifest['classes'].index(population))
 chosen=eligible[np.argsort(-degree[eligible],kind='stable')][:512]
 output['browser'][population]=[str(int(ids[i])) for i in chosen]
 for body in output['lab'][population]+output['browser'][population]:
  row=catalog.get(body)
  if row and len(row)>=10:output['positions'][body]=row[7:10]
(public/'research/atlas-variants.json').write_text(json.dumps(output,separators=(',',':')))
print('Exported verified graph rankings and',len(output['positions']),'mapped source positions.')
