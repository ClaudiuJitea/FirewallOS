#!/usr/bin/env bash
set -euo pipefail

IFACE="${1:-eth0}"

echo "[dhcp] Renewing lease on ${IFACE}"
echo "[dhcp] Before:"
ip -4 addr show dev "${IFACE}" || true
ip route show || true

if command -v dhclient >/dev/null 2>&1; then
  dhclient -r "${IFACE}" || true
  ip addr flush dev "${IFACE}" || true
  dhclient -v "${IFACE}"
else
  echo "[dhcp] dhclient not found"
  exit 1
fi

echo "[dhcp] After:"
ip -4 addr show dev "${IFACE}" || true
ip route show || true
