<#
.SYNOPSIS
    Firewall OS Control Panel

.DESCRIPTION
    A script to manage Docker containers for the Firewall project.
#>

function Check-Docker {
    try {
        docker --version *> $null
        if ($LASTEXITCODE -ne 0) { throw }
    } catch {
        Write-Host "Error: Docker is not installed or not in PATH." -ForegroundColor Red
        exit 1
    }
}

function Show-Header {
    Clear-Host
    Write-Host "====================================================" -ForegroundColor Cyan
    Write-Host "           FIREWALL OS CONTROL PANEL            " -ForegroundColor Blue
    Write-Host "====================================================" -ForegroundColor Cyan
}

function Pause-Script {
    Write-Host "`nPress any key to continue..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Show-AccessUrlIfRunning {
    param (
        [string[]]$ComposeArgs
    )

    $frontendContainerId = (docker compose @ComposeArgs ps -q frontend 2>$null).Trim()
    if ([string]::IsNullOrWhiteSpace($frontendContainerId)) {
        return
    }

    $isRunning = (docker inspect -f '{{.State.Running}}' $frontendContainerId 2>$null).Trim()
    if ($isRunning -eq "true") {
        Write-Host "Firewall UI is available at: http://localhost" -ForegroundColor Cyan
    }
}

function Invoke-Action {
    param (
        [string]$Action
    )

    $composeArgs = @("-f", "docker-compose-firewall.yml")

    Write-Host "Action: $Action" -ForegroundColor Blue
    Write-Host "----------------------------------------------------" -ForegroundColor Cyan

    switch ($Action) {
        "deploy" {
            Write-Host "Deploying and building containers..." -ForegroundColor Green
            docker compose @composeArgs up -d --build frontend backend
            Show-AccessUrlIfRunning -ComposeArgs $composeArgs
        }
        "start" {
            Write-Host "Starting containers..." -ForegroundColor Green
            docker compose @composeArgs start frontend backend
            Show-AccessUrlIfRunning -ComposeArgs $composeArgs
        }
        "stop" {
            Write-Host "Stopping containers..." -ForegroundColor Yellow
            docker compose @composeArgs stop frontend backend
        }
        "restart" {
            Write-Host "Restarting containers..." -ForegroundColor Green
            docker compose @composeArgs restart frontend backend
            Show-AccessUrlIfRunning -ComposeArgs $composeArgs
        }
        "status" {
            Write-Host "Container Status:" -ForegroundColor Green
            docker compose @composeArgs ps frontend backend
            Show-AccessUrlIfRunning -ComposeArgs $composeArgs
        }
        "logs" {
            Write-Host "Showing logs (Ctrl+C to exit):" -ForegroundColor Green
            docker compose @composeArgs logs -f frontend backend
        }
        "down" {
            Write-Host "Tearing down containers, networks, volumes and images..." -ForegroundColor Red
            docker compose @composeArgs down -v --remove-orphans --rmi local
        }
        "shell-frontend" {
            Write-Host "Opening shell in frontend container..." -ForegroundColor Green
            docker compose @composeArgs exec frontend /bin/sh
        }
        "shell-backend" {
            Write-Host "Opening shell in backend container..." -ForegroundColor Green
            docker compose @composeArgs exec backend /bin/bash
            if ($LASTEXITCODE -ne 0) {
                docker compose @composeArgs exec backend /bin/sh
            }
        }
        default {
            Write-Host "Unknown action '$Action'." -ForegroundColor Red
        }
    }
}

function Show-ShellMenu {
    Show-Header
    Write-Host " Select container to open a shell into:" -ForegroundColor Yellow
    Write-Host "----------------------------------------------------" -ForegroundColor Cyan
    Write-Host " 1. Frontend" -ForegroundColor Yellow
    Write-Host " 2. Backend" -ForegroundColor Yellow
    Write-Host "----------------------------------------------------" -ForegroundColor Cyan
    Write-Host " 0. Back" -ForegroundColor Yellow
    Write-Host "====================================================" -ForegroundColor Cyan

    $shellChoice = Read-Host "Select an option [0-2]"
    switch ($shellChoice) {
        "1" { Invoke-Action "shell-frontend" }
        "2" { Invoke-Action "shell-backend" }
        "0" { return }
        default { Write-Host "Invalid option." -ForegroundColor Red; Pause-Script }
    }
}

function Show-InteractiveMenu {
    while ($true) {
        Show-Header
        Show-AccessUrlIfRunning -ComposeArgs @("-f", "docker-compose-firewall.yml")
        Write-Host "----------------------------------------------------" -ForegroundColor Cyan
        Write-Host " 1. Deploy (Up + Build)" -ForegroundColor Yellow
        Write-Host " 2. Start" -ForegroundColor Yellow
        Write-Host " 3. Stop" -ForegroundColor Yellow
        Write-Host " 4. Restart" -ForegroundColor Yellow
        Write-Host " 5. Status" -ForegroundColor Yellow
        Write-Host " 6. View Logs" -ForegroundColor Yellow
        Write-Host " 7. Tear Down (Down)" -ForegroundColor Red
        Write-Host " 8. Shell into Container" -ForegroundColor Cyan
        Write-Host "----------------------------------------------------" -ForegroundColor Cyan
        Write-Host " 0. Exit" -ForegroundColor Yellow
        Write-Host "====================================================" -ForegroundColor Cyan
        
        $choice = Read-Host "Select an option [0-8]"

        switch ($choice) {
            "1"  { Invoke-Action "deploy"; Pause-Script }
            "2"  { Invoke-Action "start"; Pause-Script }
            "3"  { Invoke-Action "stop"; Pause-Script }
            "4"  { Invoke-Action "restart"; Pause-Script }
            "5"  { Invoke-Action "status"; Pause-Script }
            "6"  { Invoke-Action "logs"; Pause-Script }
            "7"  {
                $confirm = Read-Host "Are you sure you want to tear down the Main Firewall? [y/N]"
                if ($confirm -match "^[yY]$") {
                    Invoke-Action "down"
                }
                Pause-Script
            }
            "8"  { Show-ShellMenu }
            "0" {
                Write-Host "Exiting. Goodbye!" -ForegroundColor Green
                exit 0
            }
            default {
                Write-Host "Invalid option. Please choose a number between 0 and 8." -ForegroundColor Red
                Pause-Script
            }
        }
    }
}

Check-Docker

if ($args.Count -gt 0) {
    if ($args.Count -eq 1) {
        Invoke-Action -Action $args[0]
    } else {
        Write-Host "Usage: .\firewall.ps1 [action]"
        Write-Host "Actions: deploy, start, stop, restart, status, logs, down"
        Write-Host "Run without arguments for interactive menu."
    }
} else {
    Show-InteractiveMenu
}
