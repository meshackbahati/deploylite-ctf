<p align="center">
  <img src="https://img.shields.io/badge/Category-Web%20Exploitation-6366f1?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Difficulty-Hard-ef4444?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Flag%20Format-GDG%7B...%7D-10b981?style=for-the-badge" />
</p>

# 🚀 DeployLite

> *Ship faster. Deploy smarter.*

**DeployLite** is a realistic SaaS deployment platform designed as a **hard-tier web exploitation CTF challenge**. Players interact with what looks like a legitimate startup product — complete with a marketing landing page, user dashboard, project management, CI/CD build triggers, and an admin panel — while hunting for a multi-step vulnerability chain that leads to **Remote Code Execution**.

---

## 📖 Story

DeployLite is a hot new deployment startup. Developers sign up, create projects, push configs, and trigger test builds through a slick dashboard. The company recently shipped a "Remote Build Runner" microservice to execute build scripts in isolated containers.

Users believe the builds are sandboxed.

**They are not.**

---

## 🎯 Objective

Find and exploit a chain of vulnerabilities to achieve RCE on the internal build runner and retrieve the flag from `/root/flag.txt`.

```
Flag format: GDG{...}
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│  Internet                                       │
│       │                                         │
│       ▼                                         │
│  Host Nginx (:80/:443)                          │
│       │                                         │
│       ▼                                         │
│  Docker Nginx (:4580)  ← reverse proxy          │
│       │                                         │
│       ▼                                         │
│  Web Service (:3000)  ←→  PostgreSQL (:5432)    │
│       │                                         │
│       ▼  [internal network only]                │
│  Build Runner (:5000)                           │
│       │                                         │
│       ▼                                         │
│  /root/flag.txt  🏁                             │
└─────────────────────────────────────────────────┘
```

| Service | Stack | Exposed |
|---------|-------|---------|
| **Web** | Node.js / Express | Via Nginx |
| **Database** | PostgreSQL 15 | Internal only |
| **Build Runner** | Node.js / Express | Internal only |
| **Nginx** | Nginx 1.25 | `127.0.0.1:4580` |

The build runner is **only accessible from the web container** via a Docker internal network. It is never exposed to the host or the internet.

---

## 🔗 Vulnerability Chain

This challenge requires a **4-step exploitation chain**. No single vulnerability is enough — players must discover and chain them together:

| Step | Category | Hint |
|------|----------|------|
| 1 | Client-Side Injection | Some user input is rendered unsafely |
| 2 | Authentication Bypass | The token verification has a flaw |
| 3 | Server-Side Request | Admin features talk to internal services |
| 4 | Remote Code Execution | Build scripts are executed — but filtered |

**No further hints.** The fun is in the discovery.

---

## 🖥️ Application Features

- **Landing page** — Marketing site with features, pricing, trusted-by section
- **Registration / Login** — Email + password auth with session cookies
- **Dashboard** — Project grid with stats and quick actions
- **Project management** — Create, edit, delete projects with descriptions, repo URLs, tech stacks
- **Build system** — Trigger builds, view build history, inspect terminal-styled log output
- **Preview links** — Share unique URLs for projects
- **User profiles** — Edit username, bio, company, avatar
- **Admin panel** — Audit logs, user management, platform statistics
- **Security features** — CSRF tokens, rate limiting, HttpOnly cookies, security headers

---

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- A server with Nginx (for production) or just Docker (for local testing)

### Local Development

```bash
git clone https://github.com/meshackbahati/deploylite-ctf deploylite
cd deploylite

# Start all services
docker compose build
docker compose up -d

# Verify
curl http://localhost:4580/api/health
```

Open `http://localhost:4580` in your browser.

### Production Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for full instructions on deploying to an EC2 instance with HTTPS, Nginx reverse proxy, and firewall configuration.

```bash
# One-liner deploy (on the server)
sudo bash deploy/setup.sh
```

---

## 📁 Project Structure

```
deploysale/
├── README.md                  ← You are here
├── DEPLOYMENT.md              ← EC2 deployment guide
├── WALKTHROUGH.md             ← Solution write-up (SPOILERS)
├── docker-compose.yml         ← 4-service orchestration
├── .env.example               ← Environment template
│
├── nginx/
│   └── nginx.conf             ← Reverse proxy config
│
├── db/
│   └── init.sql               ← Schema + seed data
│
├── web/                       ← Main application
│   ├── Dockerfile
│   ├── package.json
│   ├── public/                ← Frontend (static)
│   │   ├── index.html         ← Landing page
│   │   ├── login.html
│   │   ├── register.html
│   │   ├── dashboard.html
│   │   ├── project.html
│   │   ├── build-logs.html
│   │   ├── profile.html
│   │   ├── admin.html
│   │   ├── css/styles.css
│   │   └── js/                ← Client-side logic
│   └── src/                   ← Express backend
│       ├── server.js
│       ├── config/db.js
│       ├── middleware/
│       ├── routes/
│       └── utils/
│
├── build-runner/              ← Internal microservice
│   ├── Dockerfile
│   ├── package.json
│   └── src/server.js
│
└── deploy/
    └── setup.sh               ← Automated deploy script
```

---

## ⚠️ Disclaimer

This application is an **intentionally vulnerable** CTF challenge. It contains deliberate security flaws for educational purposes.

**DO NOT** deploy this in any production environment or on any system that handles real user data. Use it only in isolated CTF/lab settings.

---

## 📜 License

Built for g24sec GDG CTF event. For educational and competitive use only.
