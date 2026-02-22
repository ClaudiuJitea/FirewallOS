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

function Invoke-Action {
    param (
        [string]$Action
    )

    $composeArgs = @("-f", "docker-compose.yml")

    Write-Host "Action: $Action" -ForegroundColor Blue
    Write-Host "----------------------------------------------------" -ForegroundColor Cyan

    switch ($Action) {
        "deploy" {
            Write-Host "Deploying and building containers..." -ForegroundColor Green
            docker compose @composeArgs up -d --build
        }
        "start" {
            Write-Host "Starting containers..." -ForegroundColor Green
            docker compose @composeArgs start
        }
        "stop" {
            Write-Host "Stopping containers..." -ForegroundColor Yellow
            docker compose @composeArgs stop
        }
        "restart" {
            Write-Host "Restarting containers..." -ForegroundColor Green
            docker compose @composeArgs restart
        }
        "status" {
            Write-Host "Container Status:" -ForegroundColor Green
            docker compose @composeArgs ps
        }
        "logs" {
            Write-Host "Showing logs (Ctrl+C to exit):" -ForegroundColor Green
            docker compose @composeArgs logs -f
        }
        "down" {
            Write-Host "Tearing down containers and networks..." -ForegroundColor Red
            docker compose @composeArgs down
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
        Write-Host "----------------------------------------------------" -ForegroundColor Cyan
        Write-Host " 0. Exit" -ForegroundColor Yellow
        Write-Host "====================================================" -ForegroundColor Cyan
        
        $choice = Read-Host "Select an option [0-7]"

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
            "0" {
                Write-Host "Exiting. Goodbye!" -ForegroundColor Green
                exit 0
            }
            default {
                Write-Host "Invalid option. Please choose a number between 0 and 7." -ForegroundColor Red
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
