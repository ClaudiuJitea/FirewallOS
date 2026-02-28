<#
.SYNOPSIS
    Firewall OS Client Control Panel

.DESCRIPTION
    A script to manage Docker containers for the Firewall Client Testing Environment.
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
    Write-Host "        FIREWALL OS CLIENT CONTROL PANEL        " -ForegroundColor Blue
    Write-Host "====================================================" -ForegroundColor Cyan
}

function Pause-Script {
    Write-Host "`nPress any key to continue..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Invoke-Action {
    param (
        [string]$Action
    )

    $composeArgs = @("-f", "docker-compose-client.yml")

    Write-Host "Action: $Action" -ForegroundColor Blue
    Write-Host "----------------------------------------------------" -ForegroundColor Cyan

    switch ($Action) {
        "deploy" {
            Write-Host "Deploying and building containers..." -ForegroundColor Green
            docker compose @composeArgs up -d --build client
        }
        "start" {
            Write-Host "Starting containers..." -ForegroundColor Green
            docker compose @composeArgs start client
        }
        "stop" {
            Write-Host "Stopping containers..." -ForegroundColor Yellow
            docker compose @composeArgs stop client
        }
        "restart" {
            Write-Host "Restarting containers..." -ForegroundColor Green
            docker compose @composeArgs restart client
        }
        "status" {
            Write-Host "Container Status:" -ForegroundColor Green
            docker compose @composeArgs ps client
        }
        "logs" {
            Write-Host "Showing logs (Ctrl+C to exit):" -ForegroundColor Green
            docker compose @composeArgs logs -f client
        }
        "down" {
            Write-Host "Tearing down containers, networks and images..." -ForegroundColor Red
            docker compose @composeArgs down --remove-orphans --rmi local
        }
        "shell" {
            Write-Host "Opening shell in client container..." -ForegroundColor Green
            docker compose @composeArgs exec client /bin/bash
            if ($LASTEXITCODE -ne 0) {
                docker compose @composeArgs exec client /bin/sh
            }
        }
        default {
            Write-Host "Unknown action '$Action'." -ForegroundColor Red
        }
    }
}

function Show-InteractiveMenu {
    while ($true) {
        Show-Header
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
                $confirm = Read-Host "Are you sure you want to tear down the Client Environment? [y/N]"
                if ($confirm -match "^[yY]$") {
                    Invoke-Action "down"
                }
                Pause-Script
            }
            "8"  { Invoke-Action "shell" }
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
        Write-Host "Usage: .\firewall-client.ps1 [action]"
        Write-Host "Actions: deploy, start, stop, restart, status, logs, down"
        Write-Host "Run without arguments for interactive menu."
    }
} else {
    Show-InteractiveMenu
}
