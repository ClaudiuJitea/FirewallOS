#!/usr/bin/env bash
set -euo pipefail

echo "[client] Firewall test client started."
echo "[client] Container: $(hostname)"
echo "[client] Current interface state:"
ip -4 addr show dev eth0 || true
echo
echo "[client] Available tools:"
echo "  - /opt/fw-tests/tools/dhcp-renew.sh"
echo "  - /opt/fw-tests/tools/test-basic.sh"
echo "  - /opt/fw-tests/tools/test-dns.sh <domain>"
echo "  - /opt/fw-tests/tools/test-ports.sh <target> [ports]"
echo "  - /opt/fw-tests/tools/test-web.sh <url>"
echo
echo "[client] Open a shell with:"
echo "  docker compose -f docker-compose.yml -f docker-compose.client.yml exec client bash"
echo

sleep infinity
