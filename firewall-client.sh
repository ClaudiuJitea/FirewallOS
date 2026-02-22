#!/bin/bash

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

COMPOSE_CLIENT="docker compose -f docker-compose.yml -f docker-compose.client.yml"

print_header() {
    clear
    echo -e "${CYAN}====================================================${NC}"
    echo -e "${BLUE}        FIREWALL OS CLIENT CONTROL PANEL        ${NC}"
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

execute_action() {
    local action=$1
    local compose_cmd="$COMPOSE_CLIENT"

    echo -e "${BLUE}Action:${NC} $action"
    echo -e "${CYAN}----------------------------------------------------${NC}"

    case $action in
        "deploy")
            echo -e "${GREEN}Deploying and building containers...${NC}"
            $compose_cmd up -d --build
            ;;
        "start")
            echo -e "${GREEN}Starting containers...${NC}"
            $compose_cmd start
            ;;
        "stop")
            echo -e "${YELLOW}Stopping containers...${NC}"
            $compose_cmd stop
            ;;
        "restart")
            echo -e "${GREEN}Restarting containers...${NC}"
            $compose_cmd restart
            ;;
        "status")
            echo -e "${GREEN}Container Status:${NC}"
            $compose_cmd ps
            ;;
        "logs")
            echo -e "${GREEN}Showing logs (Ctrl+C to exit):${NC}"
            $compose_cmd logs -f
            ;;
        "down")
            echo -e "${RED}Tearing down containers and networks...${NC}"
            $compose_cmd down
            ;;
        *)
            echo -e "${RED}Unknown action '${action}'. Valid actions: deploy, start, stop, restart, status, logs, down.${NC}"
            ;;
    esac
}

interactive_mode() {
    while true; do
        print_header
        echo -e " ${YELLOW}1.${NC} Deploy (Up + Build)"
        echo -e " ${YELLOW}2.${NC} Start"
        echo -e " ${YELLOW}3.${NC} Stop"
        echo -e " ${YELLOW}4.${NC} Restart"
        echo -e " ${YELLOW}5.${NC} Status"
        echo -e " ${YELLOW}6.${NC} View Logs"
        echo -e " ${RED}7.${NC} Tear Down (Down)"
        echo -e "${CYAN}----------------------------------------------------${NC}"
        echo -e " ${YELLOW}0.${NC} Exit"
        echo -e "${CYAN}====================================================${NC}"
        echo -n -e "Select an option [0-7]: "
        read -r choice

        case $choice in
            1) execute_action "deploy"; pause ;;
            2) execute_action "start"; pause ;;
            3) execute_action "stop"; pause ;;
            4) execute_action "restart"; pause ;;
            5) execute_action "status"; pause ;;
            6) execute_action "logs"; pause ;;
            7)
                echo -n -e "${RED}Are you sure you want to tear down the Client Environment? [y/N] ${NC}"
                read -r confirm
                if [[ "$confirm" =~ ^[Yy]$ ]]; then
                    execute_action "down"
                fi
                pause
                ;;
            0) 
                echo -e "${GREEN}Exiting. Goodbye!${NC}"
                exit 0 
                ;;
            *) 
                echo -e "${RED}Invalid option. Please choose a number between 0 and 7.${NC}"
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
