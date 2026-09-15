#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
export PATH="$project_root/.local-data/tools/node/bin:$project_root/.local-data/tools/uv:$HOME/.local/bin:$PATH"
# Help is available even before language runtimes are installed.
if [[ "${1:-help}" == help ]]; then
  cat <<'HELP'
Drosophila Lab
  make run           Resolve dependencies, start Docker/services, launch the lab
  make setup         Install locked web and uv/Python dependencies
  make start         Start/reuse services after setup
  make stop          Stop this lab; preserve databases and checkpoints
  make status        Show running services, ports and log paths
  make check-ports   Inspect preferred ports without modifying services
  make logs          Follow the website log (trainer: docker compose logs)
  make test          Run all web, research and Python suites; aggregate failures
  make test-web      Run Node persistence/data tests
  make test-research Run full browser and HTTP contract checks
  make test-python   Run uv-managed numerical tests
  make lint          Run web/Python checks and validate agent configuration
  make lint-fix      Format/fix maintained code, then verify
  make build         Build the production website
  make check         Run all linters, tests, and production build
  make check-agents  Validate shared instructions, skills and reviewer registrations
  make backup        Stop website and create a private database/artifact backup
  make restore BACKUP=backups/FOLDER   Restore into an empty workspace
Overrides: WEB_PORT=3000 TRAINER_PORT=8000 SUPABASE_PORT_BASE=54320
Occupied default ports get alternatives. Explicit occupied ports fail safely.
Runtime logs/config/state: .local-data/; secrets: .env.local (preserved).
HELP
  exit 0
fi
if ! command -v node >/dev/null || ! node -e 'let [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' 2>/dev/null; then
  command -v curl >/dev/null || { echo 'Install curl to bootstrap Node.js.' >&2; exit 1; }
  case "$(uname -s)/$(uname -m)" in
    Darwin/arm64) node_platform=darwin-arm64 ;; Darwin/x86_64) node_platform=darwin-x64 ;;
    Linux/x86_64) node_platform=linux-x64 ;; Linux/aarch64) node_platform=linux-arm64 ;;
    *) echo 'Install Node >=22.13 for this platform, then rerun make.' >&2; exit 1 ;;
  esac
  node_version=22.19.0
  tool_stage="$(mktemp -d)"
  trap 'rm -rf "$tool_stage"' EXIT
  archive="node-v${node_version}-${node_platform}.tar.gz"
  echo "Installing project-local Node $node_version..."
  curl --fail --location --silent --show-error "https://nodejs.org/dist/v${node_version}/${archive}" -o "$tool_stage/$archive"
  curl --fail --location --silent --show-error "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt" -o "$tool_stage/SHASUMS256.txt"
  (cd "$tool_stage"; awk -v f="$archive" '$2==f {print}' SHASUMS256.txt > checksum; test -s checksum; if command -v sha256sum >/dev/null; then sha256sum -c checksum; else shasum -a 256 -c checksum; fi)
  mkdir -p .local-data/tools/node
  tar -xzf "$tool_stage/$archive" -C .local-data/tools/node --strip-components=1
  rm -rf "$tool_stage"
  trap - EXIT
fi
if ! command -v uv >/dev/null; then
  command -v curl >/dev/null || { echo 'Install curl to bootstrap uv.' >&2; exit 1; }
  mkdir -p .local-data/tools/uv
  installer="$(mktemp)"
  curl --fail --location --silent --show-error https://astral.sh/uv/0.11.17/install.sh -o "$installer"
  UV_INSTALL_DIR="$project_root/.local-data/tools/uv" UV_NO_MODIFY_PATH=1 sh "$installer"
  rm -f "$installer"
fi
exec node scripts/dev.mjs "${@:-help}"
