#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PYTHON="${CLAUSETRAP_PYTHON:-$ROOT/.venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
  echo 'First follow the Python environment setup in README.md, or set CLAUSETRAP_PYTHON to an installed Python interpreter.' >&2
  exit 1
fi
export HF_HOME="${HF_HOME:-$ROOT/.cache/huggingface}"
cd "$ROOT/backend"
"$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8017 &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT INT TERM
for attempt in {1..60}; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo 'ClauseTrap API could not start. See the server error above.' >&2
    exit 1
  fi
  if curl -fsS --max-time 1 http://127.0.0.1:8017/api/health >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS --max-time 2 http://127.0.0.1:8017/api/health >/dev/null || exit 1
cd "$ROOT/frontend"
npm run dev -- --strictPort
