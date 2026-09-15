"""Generate display LOD only. Connectivity and neuron data are untouched."""

import argparse
import json
import struct
import hashlib
from pathlib import Path
import numpy as np
import fast_simplification

OUT = Path(__file__).resolve().parents[2] / "public/malecns"
parser = argparse.ArgumentParser(description="Simplify MaleCNS atlas meshes")
parser.add_argument(
    "--cache", type=Path, default=Path(__file__).resolve().parents[2] / ".local-data/raw-meshes"
)
args = parser.parse_args()
CACHE = args.cache
CACHE.mkdir(parents=True, exist_ok=True)
regions = json.loads((OUT / "meshes.json").read_text())
before = after = 0
for m in regions:
    for f in m["fragments"]:
        path = OUT / "meshes" / f["file"]
        raw = path.read_bytes()
        saved = CACHE / f["file"]
        if not saved.exists():
            saved.write_bytes(raw)
        else:
            raw = saved.read_bytes()
        n = struct.unpack("<I", raw[:4])[0]
        v = np.frombuffer(raw, dtype="<f4", offset=4, count=n * 3).reshape(-1, 3).astype("float64")
        faces = np.frombuffer(raw, dtype="<u4", offset=4 + n * 12).reshape(-1, 3).astype("int32")
        target = min(len(faces), max(1600, min(16000, int(len(faces) * 0.04))))
        center = v.mean(axis=0)
        scale = float(np.ptp(v, axis=0).max())
        vv, ff = fast_simplification.simplify(
            (v - center) / scale, faces, target_count=target, agg=7
        )
        vv = vv * scale + center
        b = struct.pack("<I", len(vv)) + vv.astype("<f4").tobytes() + ff.astype("<u4").tobytes()
        path.write_bytes(b)
        before += len(faces)
        after += len(ff)
        f.update(
            originalVertices=n,
            originalTriangles=len(faces),
            vertices=len(vv),
            triangles=len(ff),
            sourceSha256=hashlib.sha256(raw).hexdigest(),
            displaySha256=hashlib.sha256(b).hexdigest(),
        )
(OUT / "meshes.json").write_text(json.dumps(regions, separators=(",", ":")))
manifest = json.loads((OUT / "manifest.json").read_text())
manifest["displayGeometry"] = {
    "method": "Quadric edge-collapse display simplification via fast-simplification; original neuroglancer region surfaces. No generated anatomical geometry.",
    "originalTriangles": before,
    "displayTriangles": after,
    "regions": len(regions),
    "source": "https://storage.googleapis.com/flyem-male-cns/rois/",
}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
print("Display LOD triangles", before, "->", after, flush=True)
