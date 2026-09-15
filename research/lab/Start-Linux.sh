#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
umask 077
if ! command -v docker >/dev/null 2>&1; then
  echo 'Install Docker Desktop (macOS/Windows) or Docker Engine with Compose (Linux), then run this launcher again.'
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Start Docker and wait until it is ready, then run this launcher again.'
  exit 1
fi
echo 'Starting your trainer. The first build downloads dependencies and can take several minutes.'
docker compose -p drosophila-compute -f connect-compose.yaml up --build -d
for attempt in $(seq 1 60); do
  if docker compose -p drosophila-compute -f connect-compose.yaml logs --no-color --tail 200 tunnel | docker compose -p drosophila-compute -f connect-compose.yaml exec -T trainer python -m research.lab.connection_export > connection.json.tmp 2>connection-setup.log; then
    mv connection.json.tmp connection.json
    echo 'READY: In the website, open Compute and import connection.json from this folder.'
    echo 'Keep Docker running and your computer awake. Closing this terminal is fine.'
    echo 'To stop: docker compose -p drosophila-compute -f connect-compose.yaml stop'
    exit 0
  fi
  sleep 5
done
rm -f connection.json.tmp
echo 'Your trainer is still starting, or its connection failed. Check connection-setup.log and Docker, then rerun this launcher. Existing runs are preserved.'
exit 1
