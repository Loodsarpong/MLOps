#!/usr/bin/env bash
#
# scripts/dev-setup.sh — Local dev bootstrap for macOS.
#
# Automates:
#   1. Checks prerequisites (Homebrew, Docker running, Node 20, pnpm 9).
#   2. Copies .env.example -> .env if missing.
#   3. Starts Postgres + Redis + MinIO via docker compose and waits for them.
#
# After this finishes, run:
#   pnpm install --frozen-lockfile
#   pnpm --filter @ns/api migrate && pnpm --filter @ns/api seed
#   pnpm --filter @ns/api dev      # API in one terminal
#   pnpm --filter @ns/web dev      # Web in another
#
# Re-run this script any time. It's idempotent.

set -euo pipefail

# Resolve repo root from the script's location so the user can run it from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
green() { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[33m!\033[0m %s\n' "$*" >&2; }
fail()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

bold "▶ NaturalShea Care ERP — local dev setup"

# ── 1. Prereqs ────────────────────────────────────────────────────────────────
bold "1/3 Checking prerequisites"

if [[ "$(uname -s)" != "Darwin" ]]; then
  warn "This script is tuned for macOS. Linux/WSL should still work; press Ctrl-C to abort."
fi

command -v brew >/dev/null 2>&1 \
  && green "Homebrew installed" \
  || fail "Homebrew missing. Install from https://brew.sh, then re-run."

command -v docker >/dev/null 2>&1 \
  || fail "Docker missing. Install Docker Desktop: brew install --cask docker"

# `docker info` exits 0 only when the daemon is actually running.
if ! docker info >/dev/null 2>&1; then
  fail "Docker daemon is not running. Open Docker Desktop and wait for the whale icon to turn green."
fi
green "Docker daemon running"

if ! command -v node >/dev/null 2>&1; then
  fail "Node missing. Install: brew install node@20 && brew link --force --overwrite node@20"
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "${NODE_MAJOR}" != "20" ]]; then
  warn "Node ${NODE_MAJOR} detected; the repo is tested on Node 20. Proceed at your own risk."
else
  green "Node 20 active"
fi

if ! command -v pnpm >/dev/null 2>&1; then
  fail "pnpm missing. Install: brew install pnpm  (or: corepack enable)"
fi
PNPM_MAJOR="$(pnpm --version | cut -d. -f1)"
if [[ "${PNPM_MAJOR}" != "9" ]]; then
  warn "pnpm v${PNPM_MAJOR} detected; the repo pins pnpm@9 via packageManager."
else
  green "pnpm 9 active"
fi

# ── 2. .env file ──────────────────────────────────────────────────────────────
bold "2/3 Environment file"

if [[ -f .env ]]; then
  green ".env already present (left as-is)"
else
  cp .env.example .env
  green "Copied .env.example -> .env"
fi

# ── 3. docker compose up + health wait ────────────────────────────────────────
bold "3/3 Starting Postgres + Redis + MinIO"

COMPOSE_FILE="infra/docker/docker-compose.yml"
docker compose -f "${COMPOSE_FILE}" up -d
green "docker compose up -d issued"

# Postgres health: wait up to ~60s. The image's healthcheck is pg_isready.
printf 'Waiting for Postgres to be ready'
for i in {1..30}; do
  STATUS="$(docker compose -f "${COMPOSE_FILE}" ps --format json postgres 2>/dev/null \
    | grep -o '"Health":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  if [[ "${STATUS}" == "healthy" ]]; then
    printf '\n'; green "Postgres healthy"
    break
  fi
  printf '.'; sleep 2
  if [[ ${i} -eq 30 ]]; then
    printf '\n'; fail "Postgres did not become healthy within 60s. Check: docker compose -f ${COMPOSE_FILE} logs postgres"
  fi
done

# Redis health: same pattern.
for i in {1..15}; do
  STATUS="$(docker compose -f "${COMPOSE_FILE}" ps --format json redis 2>/dev/null \
    | grep -o '"Health":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  if [[ "${STATUS}" == "healthy" ]]; then
    green "Redis healthy"; break
  fi
  sleep 1
  if [[ ${i} -eq 15 ]]; then
    warn "Redis didn't report healthy in 15s; continuing anyway."
  fi
done

# ── Done ──────────────────────────────────────────────────────────────────────
cat <<'EOF'

──────────────────────────────────────────────────────────────────────────────
  ✓ Setup complete.

  Next steps (run from repo root):

    pnpm install --frozen-lockfile

    pnpm --filter @ns/api migrate          # apply DB migrations
    pnpm --filter @ns/api seed             # demo tenant + Brendamour DC

    # In two terminals:
    pnpm --filter @ns/api dev              # API   → http://localhost:4000
    pnpm --filter @ns/web dev              # Web   → http://localhost:3000

  Sign in at http://localhost:3000 with:
    email:    lsarpong@naturalsheacare.com
    password: dev-password

  Helpful Make targets:
    make install   make db   make api   make web   make down   make reset
──────────────────────────────────────────────────────────────────────────────
EOF
