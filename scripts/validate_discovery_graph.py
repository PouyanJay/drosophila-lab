"""Small real-graph integration check. Does not claim a scientific improvement."""

import json
import zipfile
from pathlib import Path
from research.lab.protocol import Graph
from research.lab.discovery_contract import DEFAULT
from research.lab.discovery import run, discovery_code_hash
from research.lab.discovery_tasks import TASKS
from research.lab.discovery_model import structural_graph, DiscoveryNetwork
from research.lab.replay_discovery import replay
import torch

root = Path(".validation")
root.mkdir(exist_ok=True)
if not (root / "graph/manifest.json").exists():
    with zipfile.ZipFile("public/research/persistent-trainer.zip") as archive:
        for name in archive.namelist():
            if name.startswith("graph/") and ".." not in Path(name).parts:
                archive.extract(name, root)
graph = Graph(root / "graph")
c = dict(
    DEFAULT,
    delays=[1],
    noise=[0.2],
    lengths=[2],
    maxCopies=2,
    candidates=2,
    pilotUpdates=1,
    fullUpdates=2,
    confirmationUpdates=2,
    examples=8,
    maxSeconds=180,
)
task = TASKS[c["task"]]
x, y = task.generate(c, 41, "train", 0, 8)
torch.set_num_threads(2)
torch.manual_seed(41)
original = DiscoveryNetwork(graph, task)
with torch.no_grad():
    a = original(x)
del original
modified, meta = structural_graph(
    graph, [dict(operator="duplicate-diverge", count=2, seed=91703)], c["population"]
)
torch.manual_seed(41)
candidate = DiscoveryNetwork(modified, task)
with torch.no_grad():
    b = candidate(x)
delta = float((a - b).abs().max())
assert delta > 0, "Structural changes must affect actual outputs"
del candidate, modified
directory = root / ("discovery-" + discovery_code_hash()[:12])
result = run(
    c,
    graph,
    directory,
    threads=2,
    progress=lambda p: print(
        json.dumps({k: p.get(k) for k in ["phase", "candidate", "seed", "elapsed"]}), flush=True
    ),
)
summary = dict(
    sourceNeurons=graph.counts.shape[0],
    sourceEdges=graph.counts.nnz,
    maxInitialLogitDifference=delta,
    outcome=result["outcome"],
    evaluatedCandidates=len(result["candidates"]),
    improved=result["improved"],
    replay=replay(graph, directory),
)
(root / "discovery-validation.json").write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
