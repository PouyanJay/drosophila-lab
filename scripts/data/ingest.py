"""Reproducible public MaleCNS v1.0 extract. Never generates biological edges."""

import argparse, json, os, hashlib, concurrent.futures, urllib.request, struct
from pathlib import Path
import numpy as np
import pyarrow.feather as feather
import pyarrow.compute as pc

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--source",
    type=Path,
    required=True,
    help="Directory containing the downloaded MaleCNS Feather tables",
)
args = parser.parse_args()
ROOT = args.source
OUT = Path(__file__).resolve().parents[2] / "public/malecns"
OUT.mkdir(exist_ok=True)
BASE = "https://storage.googleapis.com/flyem-male-cns/"
annpath = ROOT / "body-annotations-male-cns-v1.0-minconf-0.5.feather"
a = feather.read_table(annpath).to_pandas()
nt = (
    feather.read_table(ROOT / "body-neurotransmitters-male-cns-v1.0.feather")
    .to_pandas()
    .set_index("body")
    .consensus_nt.to_dict()
)
a = a[(a.status == "Traced") & a.superclass.notna()].copy()
print("Annotated traced neurons", len(a), flush=True)


def region(row):
    c = str(row.superclass)
    if c.startswith("ol_") or c.startswith("visual_"):
        return 0 if row.somaSide == "L" else 1
    if c.startswith("vnc_") or c in ["ascending_neuron", "sensory_ascending"]:
        return 3
    return 2


a["atlas_group"] = a.apply(region, axis=1)


# Coordinates are nm → micrometres with a documented viewing transform, x,-z,y.
def xyz(loc):
    return [
        round(float(loc[0]) * 0.008, 3),
        round(-float(loc[2]) * 0.008, 3),
        round(float(loc[1]) * 0.008, 3),
    ]


cat = []
points = []
for row in a.itertuples():
    loc = row.somaLocation if isinstance(row.somaLocation, np.ndarray) else row.tosomaLocation
    if not isinstance(loc, np.ndarray) or len(loc) != 3:
        continue
    pos = xyz(loc)
    cat.append(
        [
            int(row.bodyId),
            row.type or "",
            row.instance or "",
            row.superclass,
            row.somaSide or "",
            nt.get(row.bodyId) or "unknown",
            row.atlas_group,
            *pos,
        ]
    )
    points.append([*pos, row.atlas_group])
(OUT / "neurons.json").write_text(json.dumps(cat, separators=(",", ":")))
np.array(points, dtype="<f4").tofile(OUT / "somas.bin")
print("Positioned neurons", len(cat), flush=True)
lookup = {int(r.bodyId): r for r in a.itertuples()}
positioned = {r[0] for r in cat}
catalog = {r[0]: r for r in cat}
w = feather.read_table(
    ROOT / "connectome-weights-male-cns-v1.0-minconf-0.5.feather", memory_map=True
)
specs = [
    ("mushroom", "Mushroom body output", ["MBON11", "PPL101"]),
    ("steering", "Descending steering", ["DNa02", "DNa01"]),
    ("escape", "Giant-fiber escape", ["DNp01"]),
]
manifest = []
all_selected = set()
for slug, title, types in specs:
    seeds = [int(r.bodyId) for r in a.itertuples() if r.type in types and r.bodyId in positioned]
    incident = w.filter(
        pc.or_(
            pc.is_in(w["body_pre"], value_set=__import__("pyarrow").array(seeds)),
            pc.is_in(w["body_post"], value_set=__import__("pyarrow").array(seeds)),
        )
    ).to_pandas()
    scores = {}
    for e in incident.itertuples():
        for bid in [e.body_pre, e.body_post]:
            if bid in positioned:
                scores[bid] = scores.get(bid, 0) + int(e.weight)
    chosen = (
        seeds
        + [b for b in sorted(scores, key=lambda b: (-scores[b], b)) if b not in seeds][
            : 192 - len(seeds)
        ]
    )
    ids = {b: i for i, b in enumerate(chosen)}
    arr = __import__("pyarrow").array(chosen)
    sub = w.filter(
        pc.and_(pc.is_in(w["body_pre"], value_set=arr), pc.is_in(w["body_post"], value_set=arr))
    ).to_pandas()
    # Minimum count removes single-synapse edges; original counts are retained in every edge.
    sub = sub[sub.weight >= 5]
    nodes = []
    for bid in chosen:
        c = catalog[bid]
        nodes.append(
            dict(
                id=ids[bid],
                bodyId=str(bid),
                type=c[1],
                instance=c[2],
                superclass=c[3],
                side=c[4],
                nt=c[5],
                group=c[6],
                x=c[7],
                y=c[8],
                z=c[9],
                input=0.5 if bid in seeds else 0,
                bias=0,
                original=True,
            )
        )
    edges = [
        dict(
            source=ids[e.body_pre],
            target=ids[e.body_post],
            weight=(-1 if nt.get(e.body_pre) == "gaba" else 1) * float(e.weight),
            synapses=int(e.weight),
            original=True,
        )
        for e in sub.itertuples()
    ]
    # Modeling sign: GABA negative; all other/unknown NT positive. Explicit approximation, not receptor inference.
    g = dict(
        id="malecns-" + slug,
        name=title,
        provenance="HHMI Janelia / Cambridge / Google Research · MaleCNS v1.0 · CC BY 4.0",
        dataset="male-cns:v1.0",
        nodes=nodes,
        edges=edges,
        history=[],
        parent=None,
        selection=dict(
            seedTypes=types,
            seedBodies=[str(b) for b in seeds],
            method="Seed neurons plus strongest one-hop partners with annotated soma/root coordinates; induced directed graph, >=5 synapses per edge.",
            maxNodes=192,
            minSynapses=5,
        ),
        coordinateUnits="micrometres",
        signModel="GABA inhibitory; other/unknown transmitters treated as excitatory. Receptor effects are not modeled.",
    )
    (OUT / (slug + ".json")).write_text(json.dumps(g, separators=(",", ":")))
    manifest.append(
        dict(
            slug=slug,
            title=title,
            nodes=len(nodes),
            edges=len(edges),
            synapses=sum(e["synapses"] for e in edges),
            seedTypes=types,
            seedBodies=[str(b) for b in seeds],
        )
    )
    all_selected.update(seeds)
    print(slug, len(nodes), len(edges), flush=True)
# Deterministic morphology atlas: varied annotated classes and all experiment seed neurons.
for group in range(4):
    subset = (
        a[(a.atlas_group == group) & a.somaLocation.notna()]
        .drop_duplicates("type")
        .sort_values("bodyId")
    )
    if len(subset):
        all_selected.update(
            int(x)
            for x in subset.iloc[
                np.linspace(0, len(subset) - 1, min(32, len(subset))).astype(int)
            ].bodyId
        )
(OUT / "manifest.json").write_text(
    json.dumps(
        dict(
            dataset="MaleCNS v1.0",
            source="https://male-cns.janelia.org/download/",
            license="CC BY 4.0",
            attribution="FlyEM (HHMI Janelia), University of Cambridge, MRC Laboratory of Molecular Biology, Google Research",
            annotatedTracedCount=len(a),
            positionedNeuronCount=len(cat),
            coordinateUnits="µm",
            transform="Original 8 nm voxel coordinates × 0.008; view axes (x, -z, y). No invented neuron positions.",
            circuits=manifest,
            skeletonIds=sorted(all_selected),
            sources=[
                dict(file=p.name, sha256=hashlib.sha256(p.read_bytes()).hexdigest())
                for p in [
                    annpath,
                    ROOT / "body-neurotransmitters-male-cns-v1.0.feather",
                    ROOT / "connectome-weights-male-cns-v1.0-minconf-0.5.feather",
                ]
            ],
        ),
        indent=2,
    )
)
print("Circuit extraction complete", flush=True)
