# Firewall Test Client (DHCP)

This is an isolated test client container that can be added/removed without changing your core stack behavior.

## Start

```bash
docker compose -f docker-compose.yml -f docker-compose.client.yml up -d --build
```

Open shell:

```bash
docker compose -f docker-compose.yml -f docker-compose.client.yml exec client bash
```

## LAN Segment for Testing

This client stack creates a dedicated test LAN bridge:
- Subnet: `10.0.0.0/24`
- Backend test-LAN IP: `10.0.0.1`

This matches your logical LAN segment.

## Configure DHCP in Firewall UI

In `DHCP Server`, create/update pool:
- `Interface`: `ANY` (recommended for Docker testing)
- `Range`: `10.0.0.100` to `10.0.0.200`
- `Subnet mask`: `255.255.255.0`
- `Gateway`: `10.0.0.1`
- `DNS`: `10.0.0.1` or `8.8.8.8,8.8.4.4`

Then renew lease in client:

```bash
/opt/fw-tests/tools/dhcp-renew.sh
```

## Test Tools

- Basic connectivity + DNS:
```bash
/opt/fw-tests/tools/test-basic.sh
```

- DNS filtering checks:
```bash
/opt/fw-tests/tools/test-dns.sh example.com
```

- Port filtering checks:
```bash
/opt/fw-tests/tools/test-ports.sh 8.8.8.8 53,80,443
```

- Web allow/block checks:
```bash
/opt/fw-tests/tools/test-web.sh https://example.com
```

- Manual packet/traffic tools available:
`ping`, `curl`, `dig`, `nc`, `nmap`, `tcpdump`, `traceroute`

## Validate via Firewall UI

- `DHCP Server -> Active Leases`: confirm client lease appears
- `Firewall Rules`: apply allow/block rules and re-run tests
- `DNS Filtering`: block/allow domains and re-run DNS/web tests
- `Live Logs`: observe rule hits

## Remove (easy cleanup)

Stop and remove test client only:

```bash
docker compose -f docker-compose.yml -f docker-compose.client.yml stop client
docker compose -f docker-compose.yml -f docker-compose.client.yml rm -f client
```

Remove built image too (optional):

```bash
docker image rm firewall-client || true
```
