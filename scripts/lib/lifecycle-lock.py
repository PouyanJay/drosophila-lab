"""Hold a kernel-backed lifecycle lock until the parent's pipe closes."""

import fcntl
from pathlib import Path
import sys

path = Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
with path.open("a") as lock:
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("busy", flush=True)
        raise SystemExit(3)
    print("locked", flush=True)
    sys.stdin.read()
