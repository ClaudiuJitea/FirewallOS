# FirewallOS

FirewallOS is a Docker-based firewall management platform with a web UI, backend control API, and optional client test container. It manages nftables, routing, DNS filtering, and DHCP from a single interface.

## Project Structure

- `backend`: REST/WebSocket API, nftables + dnsmasq integration, system diagnostics, and shell endpoint.
- `frontend`: React management UI for firewall/network operations.
- `client`: Optional test client container and network test tooling.

## Compose Files

| File | Purpose |
|---|---|
| `docker-compose-firewall.yml` | Main stack (`frontend` + `backend`) |
| `docker-compose-firewall.generated.yml` | Auto-generated topology override (created by `firewall.sh` deploy flow) |
| `docker-compose-client.yml` | Test client stack attached to `firewall_lan` |

The main stack and client stack are independent and can be started/stopped separately.

## Features

- Firewall rules management (nftables-backed)
- NAT and port forwarding management
- Static routes management
- Interface configuration and discovery
- DNS filtering management
- DHCP pool + static leases management
- Live logs and system metrics
- Backend diagnostics and web shell console
- User authentication/session handling in UI

## Pre-requisites

- Docker
- Docker Compose (`docker compose`)

## Deployment & Management

Use the provided control scripts for interactive and direct action-based operations.

### Main Stack (frontend + backend)

Linux/macOS:

```bash
chmod +x firewall.sh
./firewall.sh
```

Windows PowerShell:

```powershell
.\firewall.ps1
```

#### Interactive menu options

| Option | Action |
|---|---|
| 1 | Deploy (build and start containers) |
| 2 | Start containers |
| 3 | Stop containers |
| 4 | Restart containers |
| 5 | Show status |
| 6 | View live logs |
| 7 | Tear down |
| 8 | Shell into container (frontend/backend) |
| 0 | Exit |

#### Direct actions (non-interactive)

Linux/macOS:

```bash
./firewall.sh deploy
./firewall.sh start
./firewall.sh stop
./firewall.sh restart
./firewall.sh status
./firewall.sh logs
./firewall.sh down
./firewall.sh shell-frontend
./firewall.sh shell-backend
```

Windows PowerShell:

```powershell
.\firewall.ps1 deploy
.\firewall.ps1 start
.\firewall.ps1 stop
.\firewall.ps1 restart
.\firewall.ps1 status
.\firewall.ps1 logs
.\firewall.ps1 down
.\firewall.ps1 shell-frontend
.\firewall.ps1 shell-backend
```

UI is available at `http://localhost`.

### Dynamic LAN Topology (Linux/macOS `firewall.sh`)

During `deploy` in interactive mode, `firewall.sh` can:

- Set LAN1 subnet (validated `/24`, default `10.0.0.0/24`)
- Add `LAN2..LAN9` (up to 8 extra LAN segments)
- Validate subnets are unique and correctly formatted
- Generate `docker-compose-firewall.generated.yml` automatically

Generated LAN gateways are set to `.254` of each `/24` subnet.

### Client Stack (testing environment)

Linux/macOS:

```bash
chmod +x firewall-client.sh
./firewall-client.sh
```

Windows PowerShell:

```powershell
.\firewall-client.ps1
```

#### Interactive menu options

| Option | Action |
|---|---|
| 1 | Deploy (build and start client container) |
| 2 | Start container |
| 3 | Stop container |
| 4 | Restart container |
| 5 | Show status |
| 6 | View live logs |
| 7 | Tear down |
| 8 | Shell into client container |
| 0 | Exit |

#### Direct actions (non-interactive)

Linux/macOS:

```bash
./firewall-client.sh deploy
./firewall-client.sh start
./firewall-client.sh stop
./firewall-client.sh restart
./firewall-client.sh status
./firewall-client.sh logs
./firewall-client.sh down
./firewall-client.sh shell
```

Windows PowerShell:

```powershell
.\firewall-client.ps1 deploy
.\firewall-client.ps1 start
.\firewall-client.ps1 stop
.\firewall-client.ps1 restart
.\firewall-client.ps1 status
.\firewall-client.ps1 logs
.\firewall-client.ps1 down
.\firewall-client.ps1 shell
```

The client uses external Docker network `firewall_lan`.
Start the main firewall stack first so the network exists.

## Usage

### Overview and Configuration
![Dashboard Overview](img/Screenshot%20From%202026-02-22%2015-53-22.png)

![Detailed Configuration 1](img/Screenshot%20From%202026-02-22%2015-53-34.png)

![Detailed Configuration 2](img/Screenshot%20From%202026-02-22%2015-53-47.png)

![Detailed Configuration 3](img/Screenshot%20From%202026-02-22%2015-54-00.png)

![Detailed Configuration 4](img/Screenshot%20From%202026-02-22%2015-54-14.png)

### Rule Management and Policy Simulation
![Firewall Rules Configuration](img/Screenshot%20From%202026-02-22%2016-45-26.png)

![Simulation View](img/Screenshot%20From%202026-02-22%2016-45-36.png)

## Troubleshooting

- `firewall_lan` missing during client deploy: start/deploy the main stack first.
- Shell option fails: verify container is running via `status`.
- Firewall or DHCP changes not applied: ensure backend runs with `NET_ADMIN` and `NET_RAW` (configured in `docker-compose-firewall.yml`).
- Custom topology not reflected: check/update `docker-compose-firewall.generated.yml` by redeploying via `./firewall.sh deploy` in interactive mode.
