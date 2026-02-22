Write-Host "Deploying Firewall Manager..."
docker compose up -d --build
Write-Host "Deployment complete! Access the UI at http://localhost"
