# DeployLite CTF Challenge — Deployment Guide

Deployment instructions for `deploylite.g24sec.space` on a shared EC2 instance that already runs other services.

---

## Prerequisites

- EC2 instance running Ubuntu 22.04 (t2.micro or larger)
- Docker and Docker Compose already installed
- Nginx already running as a shared reverse proxy on the host
- DNS A record for `deploylite.g24sec.space` pointing to the EC2 public IP
- SSH access to the server

---

## 1. Clone the Project

```bash
cd /opt
sudo git clone <your-repo-url> deploylite
cd /opt/deploylite
```

---

## 2. Configure Environment

```bash
sudo cp .env.example .env
```

The defaults are fine for CTF use. If you want to change the JWT secret or DB password, edit `.env` before first run.

---

## 3. Adjust Docker Compose Ports

Since other services share this host, the Docker Compose does **not** expose ports 80/443 directly. The internal Nginx container is mapped to a high port, and your **host-level Nginx** reverse-proxies to it.

Edit `docker-compose.yml` — change the nginx service ports:

```yaml
  nginx:
    ports:
      - "127.0.0.1:4580:80"   # Only bind on localhost
```

Remove the `443:443` mapping (host Nginx handles TLS via Certbot).

---

## 4. Build and Start Containers

```bash
cd /opt/deploylite
sudo docker compose build
sudo docker compose up -d
```

Verify all 4 containers are running:

```bash
sudo docker compose ps
```

You should see: `deploylite-web`, `deploylite-db`, `deploylite-build-runner`, `deploylite-nginx`

---

## 5. Generate the Admin Password Hash

The `init.sql` seeds an admin user with a pre-computed bcrypt hash. To use the default credentials:

- **Email:** `admin@deploylite.io`
- **Password:** `D3pl0y!Admin2024`

If you want a different password, generate a new hash:

```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('YOUR_NEW_PASSWORD', 12).then(h => console.log(h));"
```

Then replace the hash in `db/init.sql` and recreate the DB:

```bash
sudo docker compose down -v   # WARNING: destroys data
sudo docker compose up -d
```

---

## 6. Host-Level Nginx Site Config

Create a new site config for `deploylite.g24sec.space`:

```bash
sudo nano /etc/nginx/sites-available/deploylite
```

Paste:

```nginx
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
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/deploylite /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. Enable HTTPS with Certbot

```bash
sudo certbot --nginx -d deploylite.g24sec.space
```

Certbot will auto-modify the Nginx config to add SSL. If it asks, choose to redirect HTTP → HTTPS.

Verify auto-renewal:

```bash
sudo certbot renew --dry-run
```

---

## 8. Firewall Rules

If UFW is active, ensure ports 80 and 443 are open (they likely already are for existing services):

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

The build-runner container is NOT exposed to the host — it's on a Docker internal network only. No firewall rule needed for it.

---

## 9. Verify the Deployment

```bash
# Landing page
curl -s https://deploylite.g24sec.space/ | head -20

# Health check
curl -s https://deploylite.g24sec.space/api/health

# Register a test user
curl -s -X POST https://deploylite.g24sec.space/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","username":"testuser","password":"TestPass123!"}'

# Login as admin
curl -s -X POST https://deploylite.g24sec.space/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@deploylite.io","password":"D3pl0y!Admin2024"}' \
  -c cookies.txt
```

---

## 10. Maintenance Commands

```bash
# View logs
sudo docker compose logs -f web
sudo docker compose logs -f build-runner

# Restart all services
sudo docker compose restart

# Rebuild after code changes
sudo docker compose build && sudo docker compose up -d

# Full reset (destroys all data)
sudo docker compose down -v
sudo docker compose up -d

# Check build-runner isolation
sudo docker exec deploylite-build-runner wget -q -O- http://google.com 2>&1 || echo "No external access (expected)"
```

---

## Architecture on Shared EC2

```
Internet
    │
    ▼
Host Nginx (:80/:443)  ──►  deploylite.g24sec.space
    │                              │
    ▼                              ▼
Docker Nginx (:4580)  ◄──  [frontend network]
    │
    ▼
deploylite-web (:3000)  ──►  deploylite-db (:5432)
    │
    ▼
[internal network]  ──►  deploylite-build-runner (:5000)
                              │
                              ▼
                         /root/flag.txt
```

The build-runner is **only** reachable from the web container via Docker internal network. It is not exposed to the host or the internet.
