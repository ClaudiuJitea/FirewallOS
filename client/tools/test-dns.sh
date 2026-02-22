#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-example.com}"

echo "[dns] Resolver config:"
cat /etc/resolv.conf || true
echo
echo "[dns] Querying ${DOMAIN}:"
dig "${DOMAIN}" +time=2 +tries=1 || true
