#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-8.8.8.8}"
PORTS="${2:-53,80,443}"

echo "[ports] nmap quick scan ${TARGET} ports ${PORTS}"
nmap -Pn -p "${PORTS}" "${TARGET}" || true
echo
echo "[ports] netcat checks"
IFS=',' read -ra P <<< "${PORTS}"
for port in "${P[@]}"; do
  echo "  -> ${TARGET}:${port}"
  nc -vz -w 2 "${TARGET}" "${port}" || true
done
