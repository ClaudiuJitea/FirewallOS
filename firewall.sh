#!/bin/bash

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

BASE_COMPOSE_FILE="docker-compose-firewall.yml"
GENERATED_COMPOSE_FILE="docker-compose-firewall.generated.yml"
PROJECT_NAME="firewallos-main"
declare -a COMPOSE_ARGS=()
PRIMARY_LAN_SUBNET="10.0.0.0/24"
declare -a EXTRA_LAN_SUBNETS=()

print_header() {
    clear
    echo -e "${CYAN}====================================================${NC}"
    echo -e "${BLUE}           FIREWALL OS CONTROL PANEL            ${NC}"
    echo -e "${CYAN}====================================================${NC}"
}

pause() {
    echo -e "\n${YELLOW}Press [Enter] to continue...${NC}"
    read -r
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed or not in PATH.${NC}"
        exit 1
    fi
}

is_valid_subnet_24() {
    local subnet="$1"
    local ip a b c d

    [[ "$subnet" =~ ^([0-9]{1,3}\.){3}0/24$ ]] || return 1
    ip="${subnet%/24}"
    IFS='.' read -r a b c d <<< "$ip"
    for octet in "$a" "$b" "$c" "$d"; do
        [[ "$octet" =~ ^[0-9]+$ ]] || return 1
        (( octet >= 0 && octet <= 255 )) || return 1
    done
    [[ "$d" -eq 0 ]] || return 1
    return 0
}

gateway_from_subnet_24() {
    local subnet="$1"
    local ip a b c d
    ip="${subnet%/24}"
    IFS='.' read -r a b c d <<< "$ip"
    echo "${a}.${b}.${c}.254"
}

build_compose_args() {
    COMPOSE_ARGS=(docker compose -p "$PROJECT_NAME" -f "$BASE_COMPOSE_FILE")
    if [ -f "$GENERATED_COMPOSE_FILE" ]; then
        COMPOSE_ARGS+=(-f "$GENERATED_COMPOSE_FILE")
    fi
}

print_access_url_if_running() {
    local frontend_container_id is_running
    frontend_container_id=$("${COMPOSE_ARGS[@]}" ps -q frontend 2>/dev/null || true)
    if [ -z "$frontend_container_id" ]; then
        return
    fi

    is_running=$(docker inspect -f '{{.State.Running}}' "$frontend_container_id" 2>/dev/null || echo "false")
    if [ "$is_running" = "true" ]; then
        echo -e "${GREEN}Firewall UI is available at:${NC} ${CYAN}http://localhost${NC}"
    fi
}

generate_compose_override() {
    local extra_count="$1"
    local idx lan_id subnet gateway

    {
        echo "PRIMARY_LAN_SUBNET=${PRIMARY_LAN_SUBNET}"
        echo "PRIMARY_LAN_GATEWAY=$(gateway_from_subnet_24 "$PRIMARY_LAN_SUBNET")"
        for ((idx=0; idx<extra_count; idx++)); do
            lan_id=$((idx + 2))
            echo "LAN${lan_id}_SUBNET=${EXTRA_LAN_SUBNETS[$idx]}"
            echo "LAN${lan_id}_GATEWAY=$(gateway_from_subnet_24 "${EXTRA_LAN_SUBNETS[$idx]}")"
        done
    } > ".env"

    {
        echo "services:"
        echo "  backend:"
        echo "    networks:"
        for ((idx=0; idx<extra_count; idx++)); do
            lan_id=$((idx + 2))
            echo "      lan${lan_id}:"
            echo "        interface_name: eth${lan_id}"
            echo "        gw_priority: 0"
        done
        echo ""
        echo "networks:"
        for ((idx=0; idx<extra_count; idx++)); do
            lan_id=$((idx + 2))
            echo "  lan${lan_id}:"
            echo "    name: firewall_lan${lan_id}"
            echo "    driver: bridge"
            echo "    ipam:"
            echo "      config:"
            echo "        - subnet: \${LAN${lan_id}_SUBNET:-10.0.$((idx+1)).0/24}"
            echo "          gateway: \${LAN${lan_id}_GATEWAY:-10.0.$((idx+1)).254}"
        done
    } > "$GENERATED_COMPOSE_FILE"

    echo -e "${GREEN}Generated override file:${NC} ${GENERATED_COMPOSE_FILE}"
    echo -e "${CYAN}LAN1 subnet:${NC} ${PRIMARY_LAN_SUBNET}"
    if (( extra_count > 0 )); then
        echo -e "${CYAN}Extra LANs:${NC} ${extra_count}"
    else
        echo -e "${CYAN}Extra LANs:${NC} 0"
    fi
}

configure_topology_interactive() {
    local answer count_input extra_count idx lan_id subnet default_subnet duplicate found
    EXTRA_LAN_SUBNETS=()

    while true; do
        echo -n -e "${YELLOW}LAN1 subnet (CIDR /24) [${PRIMARY_LAN_SUBNET}]: ${NC}"
        read -r subnet
        subnet="${subnet:-$PRIMARY_LAN_SUBNET}"
        if is_valid_subnet_24 "$subnet"; then
            PRIMARY_LAN_SUBNET="$subnet"
            break
        fi
        echo -e "${RED}Invalid subnet. Use format x.x.x.0/24 (example: 10.0.0.0/24).${NC}"
    done

    echo -n -e "${YELLOW}Do you want extra LAN segments (LAN2+)? [y/N] ${NC}"
    read -r answer
    if [[ ! "$answer" =~ ^[Yy]$ ]]; then
        generate_compose_override 0
        return
    fi

    while true; do
        echo -n -e "${YELLOW}How many extra LAN segments? [1-8] ${NC}"
        read -r count_input
        if [[ "$count_input" =~ ^[0-9]+$ ]] && (( count_input >= 1 && count_input <= 8 )); then
            extra_count="$count_input"
            break
        fi
        echo -e "${RED}Invalid number. Enter a value between 1 and 8.${NC}"
    done

    for ((idx=0; idx<extra_count; idx++)); do
        lan_id=$((idx + 2))
        default_subnet="10.0.$((idx+1)).0/24"
        while true; do
            echo -n -e "${YELLOW}Subnet for LAN${lan_id} (CIDR /24) [${default_subnet}]: ${NC}"
            read -r subnet
            subnet="${subnet:-$default_subnet}"

            if ! is_valid_subnet_24 "$subnet"; then
                echo -e "${RED}Invalid subnet. Use format x.x.x.0/24 (example: 10.0.1.0/24).${NC}"
                continue
            fi

            duplicate=0
            if [ "$subnet" = "$PRIMARY_LAN_SUBNET" ]; then
                duplicate=1
            else
                for found in "${EXTRA_LAN_SUBNETS[@]}"; do
                    if [ "$found" = "$subnet" ]; then
                        duplicate=1
                        break
                    fi
                done
            fi

            if (( duplicate == 1 )); then
                echo -e "${RED}Subnet already in use. Choose a unique /24 subnet.${NC}"
                continue
            fi

            EXTRA_LAN_SUBNETS+=("$subnet")
            break
        done
    done

    generate_compose_override "$extra_count"
}

execute_action() {
    local action=$1
    build_compose_args

    echo -e "${BLUE}Action:${NC} $action"
    echo -e "${CYAN}----------------------------------------------------${NC}"
    if [ -f "$GENERATED_COMPOSE_FILE" ]; then
        echo -e "${CYAN}Using topology override:${NC} ${GENERATED_COMPOSE_FILE}"
    fi

    case $action in
        "deploy")
            if [ -t 0 ]; then
                configure_topology_interactive
                build_compose_args
            fi
            echo -e "${GREEN}Deploying and building containers...${NC}"
            "${COMPOSE_ARGS[@]}" up -d --build frontend backend
            print_access_url_if_running
            ;;
        "start")
            echo -e "${GREEN}Starting containers...${NC}"
            "${COMPOSE_ARGS[@]}" start frontend backend
            print_access_url_if_running
            ;;
        "stop")
            echo -e "${YELLOW}Stopping containers...${NC}"
            "${COMPOSE_ARGS[@]}" stop frontend backend
            ;;
        "restart")
            echo -e "${GREEN}Restarting containers...${NC}"
            "${COMPOSE_ARGS[@]}" restart frontend backend
            print_access_url_if_running
            ;;
        "status")
            echo -e "${GREEN}Container Status:${NC}"
            "${COMPOSE_ARGS[@]}" ps frontend backend
            print_access_url_if_running
            ;;
        "logs")
            echo -e "${GREEN}Showing logs (Ctrl+C to exit):${NC}"
            "${COMPOSE_ARGS[@]}" logs -f frontend backend
            ;;
        "down")
            echo -e "${RED}Tearing down containers, networks, volumes and images...${NC}"
            "${COMPOSE_ARGS[@]}" down -v --remove-orphans --rmi local
            ;;
        "shell-frontend")
            echo -e "${GREEN}Opening shell in frontend container...${NC}"
            "${COMPOSE_ARGS[@]}" exec frontend /bin/sh
            ;;
        "shell-backend")
            echo -e "${GREEN}Opening shell in backend container...${NC}"
            "${COMPOSE_ARGS[@]}" exec backend /bin/bash || "${COMPOSE_ARGS[@]}" exec backend /bin/sh
            ;;
        *)
            echo -e "${RED}Unknown action '${action}'. Valid actions: deploy, start, stop, restart, status, logs, down.${NC}"
            ;;
    esac
}

shell_into_container() {
    print_header
    echo -e " ${YELLOW}Select container to open a shell into:${NC}"
    echo -e "${CYAN}----------------------------------------------------${NC}"
    echo -e " ${YELLOW}1.${NC} Frontend"
    echo -e " ${YELLOW}2.${NC} Backend"
    echo -e "${CYAN}----------------------------------------------------${NC}"
    echo -e " ${YELLOW}0.${NC} Back"
    echo -e "${CYAN}====================================================${NC}"
    echo -n -e "Select an option [0-2]: "
    read -r shell_choice
    case $shell_choice in
        1) execute_action "shell-frontend" ;;
        2) execute_action "shell-backend" ;;
        0) return ;;
        *) echo -e "${RED}Invalid option.${NC}"; pause ;;
    esac
}

interactive_mode() {
    while true; do
        print_header
        build_compose_args
        print_access_url_if_running
        echo -e "${CYAN}----------------------------------------------------${NC}"
        echo -e " ${YELLOW}1.${NC} Deploy (Up + Build)"
        echo -e " ${YELLOW}2.${NC} Start"
        echo -e " ${YELLOW}3.${NC} Stop"
        echo -e " ${YELLOW}4.${NC} Restart"
        echo -e " ${YELLOW}5.${NC} Status"
        echo -e " ${YELLOW}6.${NC} View Logs"
        echo -e " ${RED}7.${NC} Tear Down (Down)"
        echo -e " ${CYAN}8.${NC} Shell into Container"
        echo -e "${CYAN}----------------------------------------------------${NC}"
        echo -e " ${YELLOW}0.${NC} Exit"
        echo -e "${CYAN}====================================================${NC}"
        echo -n -e "Select an option [0-8]: "
        read -r choice

        case $choice in
            1) execute_action "deploy"; pause ;;
            2) execute_action "start"; pause ;;
            3) execute_action "stop"; pause ;;
            4) execute_action "restart"; pause ;;
            5) execute_action "status"; pause ;;
            6) execute_action "logs"; pause ;;
            7)
                echo -n -e "${RED}Are you sure you want to tear down the Main Firewall? [y/N] ${NC}"
                read -r confirm
                if [[ "$confirm" =~ ^[Yy]$ ]]; then
                    execute_action "down"
                fi
                pause
                ;;
            8) shell_into_container ;;
            0) 
                echo -e "${GREEN}Exiting. Goodbye!${NC}"
                exit 0 
                ;;
            *) 
                echo -e "${RED}Invalid option. Please choose a number between 0 and 8.${NC}"
                pause
                ;;
        esac
    done
}

check_docker

if [ $# -gt 0 ]; then
    execute_action "$1"
else
    interactive_mode
fi
