#!/bin/bash

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

COMPOSE_MAIN="docker compose -p firewallos-main -f docker-compose-firewall.yml"

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

execute_action() {
    local action=$1
    local compose_cmd="$COMPOSE_MAIN"

    echo -e "${BLUE}Action:${NC} $action"
    echo -e "${CYAN}----------------------------------------------------${NC}"

    case $action in
        "deploy")
            echo -e "${GREEN}Deploying and building containers...${NC}"
            $compose_cmd up -d --build frontend backend
            ;;
        "start")
            echo -e "${GREEN}Starting containers...${NC}"
            $compose_cmd start frontend backend
            ;;
        "stop")
            echo -e "${YELLOW}Stopping containers...${NC}"
            $compose_cmd stop frontend backend
            ;;
        "restart")
            echo -e "${GREEN}Restarting containers...${NC}"
            $compose_cmd restart frontend backend
            ;;
        "status")
            echo -e "${GREEN}Container Status:${NC}"
            $compose_cmd ps frontend backend
            ;;
        "logs")
            echo -e "${GREEN}Showing logs (Ctrl+C to exit):${NC}"
            $compose_cmd logs -f frontend backend
            ;;
        "down")
            echo -e "${RED}Tearing down containers and networks...${NC}"
            $compose_cmd down --remove-orphans
            ;;
        "shell-frontend")
            echo -e "${GREEN}Opening shell in frontend container...${NC}"
            $compose_cmd exec frontend /bin/sh
            ;;
        "shell-backend")
            echo -e "${GREEN}Opening shell in backend container...${NC}"
            $compose_cmd exec backend /bin/bash || $compose_cmd exec backend /bin/sh
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
