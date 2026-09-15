"""Package only trainer source, pinned graph and operator guide. No credentials/runs."""

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument("--graph", required=True)
a = p.parse_args()
root = Path(__file__).resolve().parents[2]
graph = Path(a.graph)
manifest = json.loads((graph / "manifest.json").read_text())
assert hashlib.sha256((graph / "counts.npz").read_bytes()).hexdigest() == manifest["graphSha256"]
target = root / "public/research/persistent-trainer.zip"
with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for path in sorted((root / "research/lab").iterdir()):
        if (
            path.is_file()
            and path.suffix in (".py", ".txt", ".lock", ".md")
            or path.name == "Dockerfile"
        ):
            z.write(path, "research/lab/" + path.name)
    z.write(root / "research/lab/compose.yaml", "compose.yaml")
    for name in (
        "connect-compose.yaml",
        "Start-Mac.command",
        "Start-Windows.ps1",
        "Start-Linux.sh",
    ):
        z.write(root / "research/lab" / name, name)
    z.write(root / "research/lab/SETUP.md", "START-HERE.md")
    z.write(root / "docs/REPRODUCIBLE_LAB_PLAN.md", "IMPLEMENTATION-PLAN.md")
    for name in ("counts.npz", "neurons.npz", "manifest.json"):
        z.write(graph / name, "graph/" + name)
    z.writestr(
        ".gitignore",
        ".env\nconnection.json\nconnection.json.tmp\nconnection-setup.log\n__pycache__/\nruns/\n",
    )
print(
    json.dumps(
        dict(
            archive=str(target),
            bytes=target.stat().st_size,
            sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
        )
    )
)
