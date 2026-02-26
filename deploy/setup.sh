#!/bin/bash
set -e

echo "================================================"
echo "  DeployLite CTF Challenge — Deploy Script"
echo "  Target: deploylite.g24sec.space"
echo "================================================"
echo ""

PROJECT_DIR="/opt/deploylite"
DOMAIN="deploylite.g24sec.space"

if ! command -v docker &> /dev/null; then
    echo "[!] Docker not found. Install Docker first:"
    echo "    curl -fsSL https://get.docker.com | sudo sh"
    exit 1
fi

if ! command -v docker compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "[!] Docker Compose not found. Install it first."
    exit 1
fi

echo "[*] Building and starting containers..."
cd "$PROJECT_DIR"
docker compose build --no-cache
docker compose up -d

echo ""
echo "[*] Waiting for services to become healthy..."
sleep 10

echo "[*] Checking container status..."
docker compose ps

echo ""
echo "[*] Testing health endpoint..."
HEALTH=$(curl -s http://127.0.0.1:4580/api/health 2>/dev/null || echo "FAILED")
echo "    Health: $HEALTH"

if echo "$HEALTH" | grep -q "healthy"; then
    echo "[+] DeployLite is running successfully!"
else
    echo "[-] Health check failed. Check logs: docker compose logs -f"
    exit 1
fi

echo ""
echo "[*] Setting up Nginx site config..."
if [ ! -f /etc/nginx/sites-available/deploylite ]; then
    cat > /etc/nginx/sites-available/deploylite <<'NGINX'
server {
    listen 80;
    server_name deploylite.g24sec.space;

    location / {
        proxy_pass http://127.0.0.1:4580;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10m;
    }
}
NGINX

    ln -sf /etc/nginx/sites-available/deploylite /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
    echo "[+] Nginx site config created and enabled"
else
    echo "[*] Nginx site config already exists, skipping"
fi

echo ""
echo "[*] Setting up HTTPS with Certbot..."
if command -v certbot &> /dev/null; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@g24sec.space --redirect 2>/dev/null || {
        echo "[-] Certbot failed. You may need to run it manually:"
        echo "    sudo certbot --nginx -d $DOMAIN"
    }
else
    echo "[-] Certbot not found. Install it:"
    echo "    sudo apt install -y certbot python3-certbot-nginx"
    echo "    sudo certbot --nginx -d $DOMAIN"
fi

echo ""
echo "================================================"
echo "  Deployment Complete!"
echo "  URL: https://$DOMAIN"
echo ""
echo "  Admin: admin@deploylite.io"
echo "  Pass:  D3pl0y!Admin2024"
echo "================================================"
