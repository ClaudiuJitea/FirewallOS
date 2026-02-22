#!/bin/bash
echo "Deploying Firewall Manager..."
docker compose up -d --build
echo "Deployment complete! Access the UI at http://localhost"
