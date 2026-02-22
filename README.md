# FirewallOS

FirewallOS is a comprehensive, Docker-based firewall management application that allows users to configure firewall rules, set up DHCP pools, configure static leases, and simulate network packets. It provides an intuitive frontend UI interacting with a robust backend service to handle networking policies dynamically.

## Project Structure

The project contains three main components:
- `backend`: The API and logic that handles interactions with the system's iptables and DHCP configuration (via dnsmasq).
- `frontend`: The user interface designed to provide control over the firewall configurations.
- `client`: A testing client (moved to the root directory for consistency and ease of use) used to simulate network activity and verify functionality within an isolated Docker network.

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

### Managing the Main System

We provide beautiful interactive control panels for both Linux/macOS and Windows:

**For Linux/macOS:**
```bash
./firewall.sh
```

**For Windows (PowerShell):**
```powershell
.\firewall.ps1
```

Running these scripts will open an interactive menu to deploy, start, stop, restart, view the status, or check logs of the main configuration (Frontend + Backend). 

Once deployed, the FirewallOS Management UI is accessible on port 80 at `http://localhost`.

### Testing with the Client

The testing client container has been situated in the root directory alongside other main modules. Use the client to verify DHCP bindings and network behavior. 

To spin up the test network and the client container effectively, use the dedicated client control scripts:

**For Linux/macOS:**
```bash
./firewall-client.sh
```

**For Windows (PowerShell):**
```powershell
.\firewall-client.ps1
```

These scripts provide a similar interactive menu specifically targeting the client testing environment. This ensures the client attaches to the proper bridged subnet while the backend processes its requests according to the current configuration.

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
The simulation pane enables robust verification of rule hierarchies without affecting live networks. Ensure you review the results before pushing configurations.

## Troubleshooting

- **DHCP Issues:** In case of failure to assign IP addresses, verify that the `backend` has been started with `NET_ADMIN` and `NET_RAW` capabilities.
- **Client Connectivity:** Since the client directory was moved to the root, `docker-compose.client.yml` uses the `./client` context and connects to a bridge network `lan_test`.
