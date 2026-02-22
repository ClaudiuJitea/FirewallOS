#!/usr/bin/env bash
set -euo pipefail

TARGET_IP="${1:-1.1.1.1}"
TARGET_DNS="${2:-google.com}"

echo "[basic] Interface/IP:"
ip -4 addr show dev eth0 || true
echo
echo "[basic] Routes:"
ip route show || true
echo
echo "[basic] Ping ${TARGET_IP}:"
ping -c 3 -W 2 "${TARGET_IP}" || true
echo
echo "[basic] DNS lookup ${TARGET_DNS}:"
dig +short "${TARGET_DNS}" || true
