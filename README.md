# StarlaneProxyManager

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![NPM Base](https://img.shields.io/badge/NPM%20base-2.14.0-gray)
![License](https://img.shields.io/badge/license-MIT-green)
![Docker](https://img.shields.io/badge/docker-ready-blue)

A self-hosted reverse proxy manager with OIDC/SSO, audit logging, config import/export, and API documentation. Fork of [NGINX Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) v2.14.0.

## Features

Everything in NGINX Proxy Manager works as-is. StarlaneProxyManager adds:

- **OIDC / SSO** — Single sign-on with any OpenID Connect provider (Pocket-ID, Authentik, Keycloak). OIDC-only mode with emergency password bypass.
- **MFA** — TOTP two-factor authentication with backup codes.
- **Audit Log Enhancements** — Pagination, date/user/action filtering, CSV/JSON export, configurable retention.
- **NGINX Log Viewer** — Per-host access and error log tailing from the UI with search and highlighting.
- **Import / Export** — Export proxy configs as JSON or ZIP (with certificates). Import with conflict detection. NPM database migration tool.
- **API Documentation** — Interactive Swagger UI at `/api/docs/`.
- **About Modal** — Version info, upstream attribution, license.

## Installation

### Requirements

- Docker Engine 20.10+
- Docker Compose v2+

### Quick Start

```bash
git clone https://github.com/hbftechnologies/starlaneproxymanager.git
cd StarlaneProxyManager
cp .env.example .env
docker compose up -d
```

The admin UI will be available at `http://your-host:81`.

**Default credentials:** `admin@example.com` / `changeme` — change these immediately after first login.

### Docker Compose

Create a `docker-compose.yml` or use the one included in the repo:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile
    container_name: starlane-proxy-manager
    restart: unless-stopped
    ports:
      - "80:80"     # HTTP
      - "81:81"     # Admin UI
      - "443:443"   # HTTPS
    environment:
      TZ: "America/Chicago"
      DB_SQLITE_FILE: "/data/database.sqlite"
    volumes:
      - spm_data:/data
      - spm_letsencrypt:/etc/letsencrypt
    healthcheck:
      test: ["CMD", "/usr/bin/check-health"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  spm_data:
  spm_letsencrypt:
```

### Ports

| Port | Purpose |
|------|---------|
| 80   | HTTP traffic (reverse proxy) |
| 81   | Admin UI and API |
| 443  | HTTPS traffic (reverse proxy) |

### Updating

```bash
cd StarlaneProxyManager
git pull
docker compose up -d --build
```

Your data is stored in Docker volumes and persists across rebuilds.

## Configuration

All settings are configured via environment variables in `.env` or `docker-compose.yml`. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for the full reference.

### OIDC / SSO Setup

**Via environment variables** (for automated deployments):

```yaml
environment:
  OIDC_ISSUER_URL: "https://auth.example.com"
  OIDC_CLIENT_ID: "spm-client"
  OIDC_CLIENT_SECRET: "your-secret"
  OIDC_AUTO_CREATE_USER: "true"
```

These seed the database on first run. After that, manage via **Settings > OIDC / SSO** in the admin UI.

Set the redirect URI in your OIDC provider to:
```
https://<your-spm-host>/api/auth/oidc/callback
```

**Via admin UI:**

1. Log in as admin
2. Go to **Settings > OIDC / SSO**
3. Enable OIDC, enter issuer URL, client ID, client secret
4. Click **Test Connection** to verify
5. Save

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for provider-specific examples (Pocket-ID, Authentik, Keycloak).

### Database Options

SQLite is the default and recommended for most users. MySQL and PostgreSQL are also supported:

```yaml
environment:
  DB_ENGINE: "mysql"
  DB_HOST: "db"
  DB_PORT: "3306"
  DB_NAME: "spm"
  DB_USER: "spm"
  DB_PASSWORD: "your-password"
```

## Architecture

```
Docker Container (s6-overlay process supervisor)
├── NGINX        — serves traffic using generated configs
├── Express API  — backend: config generation, auth, management
├── React UI     — admin interface on port 81
└── SQLite       — settings, hosts, certificates, audit log
```

## API

Interactive Swagger UI is built into the app:

- `http://your-host:81/api/docs/`

Health check: `GET /api/`
Authentication: JWT bearer tokens via `POST /api/tokens`

## Development

```bash
docker compose -f docker-compose.dev.yml up --build
```

Dev mode uses ports 8080/8081/8443 to avoid conflicts.

## Migrating from NGINX Proxy Manager

SPM includes a built-in migration tool. See [docs/NPM_MIGRATION_GUIDE.md](docs/NPM_MIGRATION_GUIDE.md) for step-by-step instructions.

## Contributing

Issues and pull requests are welcome at https://github.com/hbftechnologies/starlaneproxymanager.

## License

MIT — see [LICENSE](LICENSE).

Built on [NGINX Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) by Jamie Curnow. Uses [NGINX](https://nginx.org).

Maintained by [Harley Technologies](https://github.com/hbftechnologies).
