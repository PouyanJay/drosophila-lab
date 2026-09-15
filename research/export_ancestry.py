"""Precompute ancestry previews for UI-supported duplication/pruning choices."""

import argparse
import json
from pathlib import Path
import numpy as np
import scipy.sparse as sp

parser = argparse.ArgumentParser(description="Export source-copy ancestry for the atlas")
parser.add_argument("--graph", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
g = args.graph
w = sp.load_npz(g / "counts.npz")
d = np.load(g / "neurons.npz")
m = json.loads((g / "manifest.json").read_text())
catalog = {x[0]: x for x in json.loads((root / "public/malecns/neurons.json").read_text())}
order = np.argsort(w.data, kind="stable")
result = {"graphSha256": m["graphSha256"], "populations": {}}
for percent in range(0, 81, 5):
    pruned = w.copy()
    pruned.data[order[: int(w.nnz * percent / 100)]] = 0
    pruned.eliminate_zeros()
    strength = np.asarray(pruned.sum(axis=0)).ravel() + np.asarray(pruned.sum(axis=1)).ravel()
    for population in [
        "descending_neuron",
        "ascending_neuron",
        "cb_intrinsic",
        "vnc_intrinsic",
        "visual_projection",
    ]:
        eligible = np.flatnonzero(d["classes"] == m["classes"].index(population))
        chosen = eligible[np.argsort(-strength[eligible], kind="stable")][:128]
        result["populations"].setdefault(population, {})[str(percent)] = [
            {"bodyId": str(d["ids"][i]), "catalog": catalog.get(int(d["ids"][i]))} for i in chosen
        ]
(root / "public/research/ancestry.json").write_text(json.dumps(result, separators=(",", ":")))
print("Ancestry preview exported", len(result["populations"]))
