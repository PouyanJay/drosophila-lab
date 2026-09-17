"""Prepare a bounded display-only MaleCNS atlas; never modify computational graphs.

Run: uv run --frozen python scripts/data/atlas_geometry.py
"""

import argparse
import concurrent.futures
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "https://storage.googleapis.com/flyem-male-cns/v1.0/segmentation/skeletons-malecns/skeletons-swc/"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def parse_swc(raw):
    nodes = {}
    for line in raw.decode().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        fields = line.split()
        if len(fields) < 7:
            raise ValueError("Malformed SWC row")
        node_id, parent = int(fields[0]), int(fields[6])
        x, y, z, radius = (float(v) * 0.008 for v in fields[2:6])
        if node_id in nodes or not all(math.isfinite(v) for v in (x, y, z, radius)) or radius < 0:
            raise ValueError("Invalid SWC node")
        nodes[node_id] = ((x, -z, y, radius), parent)
    if not nodes:
        raise ValueError("Empty SWC")
    return nodes


def simplify(nodes, tolerance=1.0, radius_tolerance=0.25):
    """Simplify only degree-two chains; preserve roots, branch points and endpoints.

    Iterative RDP bounds positional and linearly interpolated radius deviation.
    Returned endpoints are original SWC nodes, not invented branch positions.
    """
    finished = set()
    for node in nodes:
        path = set()
        current = node
        while current in nodes and current not in finished:
            if current in path:
                raise ValueError("Cyclic SWC")
            path.add(current)
            current = nodes[current][1]
        finished.update(path)
    children = {node: [] for node in nodes}
    for node, (_, parent) in nodes.items():
        if parent in children:
            children[parent].append(node)
    anchors = {n for n, (_, p) in nodes.items() if p not in nodes or len(children[n]) != 1}
    segments = []
    visited = set()
    for start in sorted(anchors):
        for child in children[start]:
            chain = [start, child]
            while chain[-1] not in anchors:
                if chain[-1] in visited:
                    raise ValueError("Cyclic SWC")
                visited.add(chain[-1])
                chain.append(children[chain[-1]][0])
            keep = {0, len(chain) - 1}
            stack = [(0, len(chain) - 1)]
            while stack:
                lo, hi = stack.pop()
                a, b = nodes[chain[lo]][0], nodes[chain[hi]][0]
                delta = [b[k] - a[k] for k in range(3)]
                length2 = sum(v * v for v in delta)
                worst, index = 1.0, None
                for i in range(lo + 1, hi):
                    p = nodes[chain[i]][0]
                    t = (
                        max(0, min(1, sum((p[k] - a[k]) * delta[k] for k in range(3)) / length2))
                        if length2
                        else 0
                    )
                    distance = math.sqrt(sum((p[k] - a[k] - t * delta[k]) ** 2 for k in range(3)))
                    radius_error = abs(p[3] - (a[3] + t * (b[3] - a[3])))
                    error = max(distance / tolerance, radius_error / radius_tolerance)
                    if error > worst:
                        worst, index = error, i
                if index is not None:
                    keep.add(index)
                    stack.extend(((lo, index), (index, hi)))
            indices = sorted(keep)
            for lo, hi in zip(indices, indices[1:]):
                a, b = nodes[chain[lo]][0], nodes[chain[hi]][0]
                if a[:3] != b[:3]:
                    segments.extend((*a, *b))
    # Every edge must belong to a root/branch chain, including disconnected trees.
    if len(visited) + len(anchors) != len(nodes):
        raise ValueError("SWC has a cycle without a root")
    return segments


def select_cells(catalog, legacy, count):
    selected = {str(x["bodyId"]) for x in legacy if not x.get("error")}
    # One representative per type/side/group first; stable hash order within each group.
    strata = {}
    for row in catalog:
        key = (row[6], row[3], row[1], row[4])
        strata.setdefault(key, []).append(row)
    queues = {g: [] for g in range(4)}
    for key, rows in strata.items():
        rows.sort(key=lambda r: digest(str(r[0]).encode()))
        queues[key[0]].append(rows[0])
    for rows in queues.values():
        rows.sort(key=lambda r: digest(str(r[0]).encode()))
    # Brain emphasis; retain VNC coverage and the original sample.
    cycle = [0, 1, 2, 2, 2, 3]
    while len(selected) < count and any(queues.values()):
        for group in cycle:
            if queues[group] and len(selected) < count:
                selected.add(str(queues[group].pop()[0]))
    by_id = {str(r[0]): r for r in catalog}
    return [by_id[k] for k in sorted(selected, key=int)]


def prepare_cell(row, cache, tolerance):
    body = str(row[0])
    cached = cache / (body + ".swc.gz")
    if cached.exists():
        raw = gzip.decompress(cached.read_bytes())
    else:
        with urllib.request.urlopen(SOURCE + body + ".swc", timeout=45) as response:
            raw = response.read(32_000_001)
        if len(raw) > 32_000_000:
            raise ValueError("Source morphology exceeds 32 MB limit")
        cached.write_bytes(gzip.compress(raw, mtime=0))
    nodes = parse_swc(raw)
    segments = simplify(nodes, tolerance)
    positions = [n[0] for n in nodes.values()]
    return dict(
        bodyId=body,
        type=row[1],
        group=row[6],
        source=SOURCE + body + ".swc",
        sourceSha256=digest(raw),
        sourceNodes=len(nodes),
        segments=len(segments) // 8,
        bounds=[
            [min(p[k] for p in positions) for k in range(3)],
            [max(p[k] for p in positions) for k in range(3)],
        ],
    ), segments


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=768)
    parser.add_argument("--tolerance", type=float, default=1.0)
    args = parser.parse_args()
    if not 137 <= args.count <= 2048 or not 0.1 <= args.tolerance <= 4:
        parser.error("count must be 137–2048; tolerance must be 0.1–4 µm")
    source_dir = ROOT / "public/malecns"
    output = source_dir / "atlas-v1"
    cache = ROOT / ".local-data/atlas-swc"
    output.mkdir(exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    rows = select_cells(
        json.loads((source_dir / "neurons.json").read_text()),
        json.loads((source_dir / "skeletons.json").read_text()),
        args.count,
    )
    cells = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(prepare_cell, row, cache, args.tolerance) for row in rows]
        for i, future in enumerate(futures):
            cells.append(future.result())
            if (i + 1) % 64 == 0:
                print(f"Morphology {i + 1}/{len(rows)}", flush=True)
    if sum(c["segments"] for c, _ in cells) > 2_000_000:
        raise ValueError(
            "Overview exceeds two million segments; increase tolerance or reduce selection"
        )
    chunks = []
    for group in range(4):
        group_cells = [(c, s) for c, s in cells if c["group"] == group]
        for offset in range(0, len(group_cells), 32):
            selected = group_cells[offset : offset + 32]
            values, metadata = [], []
            for cell, segments in selected:
                metadata.append(dict(cell, offset=len(values) // 8))
                values.extend(segments)
            raw = struct.pack("<" + "f" * len(values), *values)
            compressed = gzip.compress(raw, mtime=0)
            name = f"group-{group}-{offset // 32}-{digest(compressed)[:12]}.bin.gz"
            (output / name).write_bytes(compressed)
            chunks.append(
                dict(
                    file=name,
                    group=group,
                    segments=len(values) // 8,
                    byteLength=len(compressed),
                    decodedByteLength=len(raw),
                    sha256=digest(compressed),
                    cells=metadata,
                )
            )
    manifest = dict(
        schema="malecns-atlas/1",
        generatorSha256=digest(Path(__file__).read_bytes()),
        catalogSha256=digest((source_dir / "neurons.json").read_bytes()),
        dataset="male-cns:v1.0",
        units="micrometres",
        transform="source 8nm voxels × 0.008; (x, -z, y)",
        layout="little-endian float32: start xyz radius, end xyz radius",
        radii="Source SWC radius estimates; not membrane segmentation surfaces",
        selection="Legacy137 plus deterministic type/side/class/group representatives; SHA256 body ordering; group cycle 0,1,2,2,2,3",
        simplification=dict(
            method="degree-two chain RDP; branch endpoints retained",
            positionToleranceUm=args.tolerance,
            radiusToleranceUm=0.25,
        ),
        license="CC-BY-4.0",
        attribution="FlyEM (HHMI Janelia), University of Cambridge, MRC LMB, Google Research",
        neuronCount=len(cells),
        segmentCount=sum(c["segments"] for c, _ in cells),
        chunks=chunks,
    )
    # Publish manifest last; hashed chunks keep old readers valid during preparation.
    (output / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    print(
        f"Prepared {manifest['neuronCount']} neurons / {manifest['segmentCount']} segments / {sum(c['byteLength'] for c in chunks) / 1e6:.1f} MB",
        flush=True,
    )


if __name__ == "__main__":
    main()
