#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VARS="$ROOT/.staging.vars"
if [[ ! -f "$VARS" ]]; then
  echo "Missing $VARS — copy from .staging.vars.example"
  exit 1
fi
cd "$ROOT"
npx wrangler secret bulk "$VARS" --env staging
echo "Done. Run: npx wrangler deploy --env staging"