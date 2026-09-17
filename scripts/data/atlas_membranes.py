# /// script
# requires-python = ">=3.11"
# dependencies = ["cloud-volume==12.14.4"]
# ///
"""Prepare a small, explicitly labeled source membrane gallery (display only).

Run with uv run scripts/data/atlas_membranes.py. CloudVolume decodes the official
sharded multi-LOD Draco meshes; this does not approximate membranes from SWCs.
"""

import gzip
import hashlib
import json
from pathlib import Path
import struct

import numpy as np
from cloudvolume import CloudVolume

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "https://storage.googleapis.com/flyem-male-cns/v1.0/segmentation"


def main():
    atlas = json.loads((ROOT / "public/malecns/atlas-v1/manifest.json").read_text())
    cells = {c["bodyId"]: c for chunk in atlas["chunks"] for c in chunk["cells"]}
    optic = min(
        (c for c in cells.values() if c["cellClass"] == "ol_intrinsic"),
        key=lambda c: c["sourceNodes"],
    )["bodyId"]
    volume = CloudVolume(SOURCE, progress=False)
    directory = ROOT / "public/malecns/membranes-v1"
    directory.mkdir(exist_ok=True)
    entries = []
    for body_id in ["10001", "519667", optic]:
        cell = cells[body_id]
        mesh = volume.mesh.get(int(body_id), lod=2)[int(body_id)]
        vertices = mesh.vertices[:, [0, 2, 1]].astype("<f4") / 1000
        vertices[:, 1] *= -1
        faces = mesh.faces.astype("<u4")
        if not np.isfinite(vertices).all() or len(vertices) > 1_000_000:
            raise ValueError("Invalid or oversized source mesh")
        if faces.size > 6_000_000 or faces.max() >= len(vertices):
            raise ValueError("Invalid source faces")
        # Skeleton centerlines and membranes need not share exact bounds, but
        # they must occupy the same physical frame. Reject unit/axis mistakes.
        bounds = np.array(cell["bounds"])
        if np.any(vertices.min(axis=0) < bounds[0] - 30) or np.any(
            vertices.max(axis=0) > bounds[1] + 30
        ):
            raise ValueError("Mesh/SWC bounds disagree by more than 30 micrometres")
        raw = struct.pack("<II", len(vertices), len(faces)) + vertices.tobytes() + faces.tobytes()
        if len(raw) > 32_000_000:
            raise ValueError("Decoded mesh exceeds 32 MB")
        packed = gzip.compress(raw, mtime=0)
        digest = hashlib.sha256(packed).hexdigest()
        filename = f"{body_id}-{digest[:12]}.bin.gz"
        (directory / filename).write_bytes(packed)
        entries.append(
            {
                "bodyId": body_id,
                "type": cell["type"],
                "file": filename,
                "sha256": digest,
                "decodedBytes": len(raw),
                "vertices": len(vertices),
                "faces": len(faces),
                "lod": 2,
                "bounds": [vertices.min(axis=0).tolist(), vertices.max(axis=0).tolist()],
            }
        )
        print(
            f"{body_id} {cell['type']}: {len(vertices)} vertices / {len(packed)} bytes", flush=True
        )
    (directory / "manifest.json").write_text(
        json.dumps(
            {
                "schema": "malecns-membranes/1",
                "source": SOURCE + "/multi-res-meshes",
                "license": "CC-BY-4.0",
                "decoder": "cloud-volume==12.14.4",
                "sourceMeshInfo": volume.mesh.meta.info,
                "sourceMeshInfoSha256": hashlib.sha256(
                    json.dumps(
                        volume.mesh.meta.info, sort_keys=True, separators=(",", ":")
                    ).encode()
                ).hexdigest(),
                "coordinates": "micrometres (x,-z,y)",
                "cells": entries,
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
