# FirewallOS

FirewallOS is a comprehensive, Docker-based firewall management application that allows users to configure firewall rules, set up DHCP pools, configure static leases, and simulate network packets. It provides an intuitive frontend UI interacting with a robust backend service to handle networking policies dynamically.

## Project Structure

The project contains three main components:

- `backend`: The API and logic that handles interactions with the system's iptables and DHCP configuration (via dnsmasq).
- `frontend`: The user interface designed to provide control over the firewall configurations.
- `client`: A testing client used to simulate network activity and verify functionality within an isolated Docker network.

### Compose Files

| File | Purpose |
|---|---|
| `docker-compose-firewall.yml` | Defines the **frontend** and **backend** services (main firewall stack) |
| `docker-compose-client.yml` | Defines the **client** service and attaches it to the `firewall_lan` bridge network |

Both stacks are fully **independent** — they can be started and stopped separately.

## Features

- Firewall Rule Management: Create, delete, and configure standard firewall rules.
- DHCP Server Configuration: Manage DHCP IP address pools dynamically.
- Static Leases: Assign fixed IPs to specific MAC addresses.
- Firewall Rule Simulation: Test network packet routing, allowing you to ascertain whether packets would be blocked or passed by the current firewall configuration without performing actual pings.

## Pre-requisites

- Docker installed on your host machine.
- Docker Compose installed.

## Deployment & Management

FirewallOS is completely containerized. Use the provided interactive control panel scripts to orchestrate the environment easily.

### Managing the Firewall Stack (Frontend + Backend)

**For Linux/macOS:**
```bash
chmod +x firewall.sh
./firewall.sh
```

**For Windows (PowerShell):**
```powershell
.\firewall.ps1
```

#### Menu Options

| Option | Action |
|---|---|
| 1 | Deploy (build and start containers) |
| 2 | Start containers |
| 3 | Stop containers |
| 4 | Restart containers |
| 5 | Show status |
| 6 | View live logs |
| 7 | Tear down (remove containers) |
| 8 | Shell into container (choose Frontend or Backend) |
| 0 | Exit |

Once deployed, the FirewallOS Management UI is accessible at `http://localhost` (port 80).

---

### Managing the Client (Testing Environment)

**For Linux/macOS:**
```bash
chmod +x firewall-client.sh
./firewall-client.sh
```

**For Windows (PowerShell):**
```powershell
.\firewall-client.ps1
```

#### Menu Options

| Option | Action |
|---|---|
| 1 | Deploy (build and start the client container) |
| 2 | Start container |
| 3 | Stop container |
| 4 | Restart container |
| 5 | Show status |
| 6 | View live logs |
| 7 | Tear down (remove container) |
| 8 | Shell into the client container |
| 0 | Exit |

The client connects to the `firewall_lan` bridge network (`10.0.0.0/24`). The backend is reachable at `10.0.0.1`.

> **Note:** Start the firewall stack first so the `firewall_lan` network exists before deploying the client.

---

## Usage

Below is a brief visual rundown of how the application interfaces are utilized.

### Overview and Configuration
![Dashboard Overview](img/Screenshot%20From%202026-02-22%2015-53-22.png)
The main interface allows you to view the general network landscape.

![Detailed Configuration 1](img/Screenshot%20From%202026-02-22%2015-53-34.png)
Navigate through tabs to edit specific entities in your firewall.

![Detailed Configuration 2](img/Screenshot%20From%202026-02-22%2015-53-47.png)
Applying configurations such as subnet masks and assigning IPs.

![Detailed Configuration 3](img/Screenshot%20From%202026-02-22%2015-54-00.png)
Configuring active settings.

![Detailed Configuration 4](img/Screenshot%20From%202026-02-22%2015-54-14.png)
Fine-tuning the setup.

### Rule Management and Policy Simulation
![Firewall Rules Configuration](img/Screenshot%20From%202026-02-22%2016-45-26.png)
Configure specific actions for incoming, outgoing, or routed packets.

![Simulation View](img/Screenshot%20From%202026-02-22%2016-45-36.png)
The simulation pane enables robust verification of rule hierarchies without affecting live networks.

---

## Troubleshooting

- **DHCP Issues:** Verify that the `backend` container has been started with `NET_ADMIN` and `NET_RAW` capabilities — both are set in `docker-compose-firewall.yml`.
- **Client Connectivity:** The client uses its own standalone `docker-compose-client.yml`. Make sure the firewall stack is running first so the `firewall_lan` network is available.
- **Shell access not working:** If option 8 fails, the container may not be running. Use option 5 (Status) to verify, then option 2 (Start) or option 1 (Deploy) to bring it up.
