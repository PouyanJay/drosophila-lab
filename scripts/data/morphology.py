import urllib.request, json, concurrent.futures, struct, os, time
from pathlib import Path
import numpy as np

OUT = Path(__file__).resolve().parents[2] / "public/malecns"
(OUT / "meshes").mkdir(exist_ok=True)
(OUT / "skeletons").mkdir(exist_ok=True)
BASE = "https://storage.googleapis.com/flyem-male-cns/"


def get(url):
    for attempt in range(3):
        try:
            return urllib.request.urlopen(url, timeout=45).read()
        except Exception:
            if attempt == 2:
                raise


def meshset(path, prefix, group=None):
    props = json.loads(get(BASE + path + "/segment_properties/info"))["inline"]
    labels = next(p["values"] for p in props["properties"] if p.get("type") == "label")

    def download(pair):
        id, label = pair
        raw = json.loads(get(BASE + path + "/mesh/" + id + ":0"))
        frags = []
        for j, frag in enumerate(raw["fragments"]):
            b = get(BASE + path + "/mesh/" + urllib.parse.quote(frag))
            name = prefix + "-" + id + "-" + str(j) + ".bin"
            (OUT / "meshes" / name).write_bytes(b)
            n = struct.unpack("<I", b[:4])[0]
            vs = np.frombuffer(b, dtype="<f4", offset=4, count=n * 3).reshape(-1, 3)
            frags.append(dict(file=name, vertices=n, center=(vs.mean(axis=0) * 0.001).tolist()))
        gg = (
            group
            if group is not None
            else (0 if label.endswith("(L)") else 1)
            if label.split("(")[0] in ["ME", "LO", "LOP", "LA", "AME"]
            else 2
        )
        return dict(
            id=prefix + "-" + id,
            label=label,
            group=gg,
            fragments=frags,
            source=BASE + path + "/mesh/" + id + ":0",
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        return list(pool.map(download, zip(props["ids"], labels)))


meshes = meshset("rois/fullbrain-roi-v5", "brain") + meshset("rois/vnc-neuropil-shell-v2", "vnc", 3)
(OUT / "meshes.json").write_text(json.dumps(meshes, separators=(",", ":")))
print("Anatomical meshes:", len(meshes), flush=True)
# Connectome extraction runs independently. Its manifest owns the exact skeleton selection.
for i in range(60):
    if (OUT / "manifest.json").exists():
        break
    time.sleep(2)
manifest = json.loads((OUT / "manifest.json").read_text())
catalog = {str(r[0]): r for r in json.loads((OUT / "neurons.json").read_text())}


def skeleton(bid):
    url = BASE + f"v1.0/segmentation/skeletons-malecns/skeletons-swc/{bid}.swc"
    try:
        raw = get(url).decode()
        nodes = {}
        parents = {}
        for line in raw.splitlines():
            if not line or line.startswith("#"):
                continue
            s = line.split()
            if len(s) < 7:
                continue
            ix = int(s[0])
            nodes[ix] = [float(s[2]) * 0.008, -float(s[4]) * 0.008, float(s[3]) * 0.008]
            parents[ix] = int(s[6])
        segments = []
        for ix, par in parents.items():
            if par in nodes:
                segments.extend(nodes[ix] + nodes[par])
        np.array(segments, dtype="<f4").tofile(OUT / "skeletons" / f"{bid}.bin")
        return dict(
            bodyId=str(bid),
            group=catalog[str(bid)][6],
            type=catalog[str(bid)][1],
            segments=len(segments) // 6,
            source=url,
        )
    except Exception as e:
        return dict(bodyId=str(bid), error=str(e))


with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    skeletons = list(pool.map(skeleton, manifest["skeletonIds"]))
(OUT / "skeletons.json").write_text(json.dumps(skeletons, separators=(",", ":")))
print("Skeletons", len(skeletons), "failed", sum("error" in s for s in skeletons), flush=True)
