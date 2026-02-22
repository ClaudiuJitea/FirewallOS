#!/usr/bin/env bash
set -euo pipefail

URL="${1:-https://example.com}"

echo "[web] curl ${URL}"
curl -I --max-time 5 "${URL}" || true
