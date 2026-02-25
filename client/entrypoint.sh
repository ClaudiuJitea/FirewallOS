#!/usr/bin/env bash
set -euo pipefail

AUTO_DHCP_RENEW="${AUTO_DHCP_RENEW:-1}"
DHCP_INTERFACE="${DHCP_INTERFACE:-eth0}"

echo "[client] Firewall test client started."
echo "[client] Container: $(hostname)"
echo "[client] Current interface state:"
ip -4 addr show dev "${DHCP_INTERFACE}" || true
echo

if [[ "${AUTO_DHCP_RENEW}" == "1" ]]; then
  echo "[client] AUTO_DHCP_RENEW=1 -> requesting DHCP lease from FirewallOS on ${DHCP_INTERFACE}"
  if /opt/fw-tests/tools/dhcp-renew.sh "${DHCP_INTERFACE}"; then
    echo "[client] DHCP renew completed."
  else
    echo "[client] DHCP renew failed; keeping current interface config." >&2
  fi
else
  echo "[client] AUTO_DHCP_RENEW=0 -> skipping DHCP renew."
fi

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
