# Configuration Reference

All settings are environment variables. Set them in `.env` or directly in your `docker-compose.yml`.

## Database

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_ENGINE` | `sqlite`, `mysql`, or `postgres` | `sqlite` |
| `DB_SQLITE_FILE` | SQLite file path inside container | `/data/database.sqlite` |
| `DB_HOST` | MySQL/PostgreSQL host | `db` |
| `DB_PORT` | MySQL/PostgreSQL port | `3306` |
| `DB_NAME` | Database name | `npm` |
| `DB_USER` | Database user | `npm` |
| `DB_PASSWORD` | Database password | `changeme` |

## Runtime

| Variable | Description | Default |
|----------|-------------|---------|
| `TZ` | Container timezone | `America/Chicago` |
| `PUID` | Run as this user ID | `0` |
| `PGID` | Run as this group ID | `0` |
| `DISABLE_IPV6` | Disable IPv6 in NGINX | `false` |

## OIDC / SSO

These seed the OIDC configuration on first run. Once the database is populated, the admin UI settings take precedence. Delete the database to re-seed from env vars.

| Variable | Description | Default |
|----------|-------------|---------|
| `OIDC_ISSUER_URL` | OIDC provider's issuer URL | (none) |
| `OIDC_CLIENT_ID` | OAuth client ID | (none) |
| `OIDC_CLIENT_SECRET` | OAuth client secret | (none) |
| `OIDC_SCOPES` | Space-separated scopes | `openid email profile` |
| `OIDC_AUTO_CREATE_USER` | Create accounts on first SSO login | `false` |
| `OIDC_BUTTON_LABEL` | Text on the SSO login button | `Sign in with SSO` |
| `PASSWORD_FORM_SHOW` | Force-show password form (overrides OIDC-only mode) | (unset) |

If `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are all set, OIDC is automatically enabled on first run.

`PASSWORD_FORM_SHOW` is a runtime override, not a seeding variable. It's checked on every request. Set it to `true` in your compose file if your OIDC provider is down and you need to log in with a password.

### OIDC Provider Setup

Set the redirect URI in your provider to:

```
https://<your-spm-host>/api/auth/oidc/callback
```

#### Pocket-ID

```yaml
OIDC_ISSUER_URL: "https://pocket-id.example.com"
OIDC_CLIENT_ID: "spm-client"
OIDC_CLIENT_SECRET: "<from Pocket-ID>"
OIDC_SCOPES: "openid email profile"
```

#### Authentik

```yaml
OIDC_ISSUER_URL: "https://authentik.example.com/application/o/spm/"
OIDC_CLIENT_ID: "<from Authentik provider>"
OIDC_CLIENT_SECRET: "<from Authentik provider>"
OIDC_SCOPES: "openid email profile"
```

#### Keycloak

```yaml
OIDC_ISSUER_URL: "https://keycloak.example.com/realms/your-realm"
OIDC_CLIENT_ID: "spm-client"
OIDC_CLIENT_SECRET: "<from Keycloak>"
OIDC_SCOPES: "openid email profile"
```

### How OIDC-Only Mode Works

When OIDC-only mode is enabled in the admin UI (Settings > OIDC / SSO), the password form is hidden. All users must sign in through the OIDC provider.

If your provider goes down:

1. Add `PASSWORD_FORM_SHOW: "true"` to your `docker-compose.yml` environment section
2. Restart the container: `docker compose up -d`
3. Log in with your admin password
4. Fix the OIDC issue or disable OIDC-only mode
5. Remove the `PASSWORD_FORM_SHOW` override and restart

### User Matching

When a user signs in via OIDC:

1. **Match by OIDC subject** — looks for an existing auth record with the provider's `sub` claim
2. **Match by email** — if no OIDC record exists, links to an existing user with the same email
3. **Auto-create** — if enabled and no match found, creates a new account from OIDC claims

This means existing password users can start using SSO without losing their accounts.

## Admin UI Settings

Settings configured through the admin UI are stored in the database and override env vars after first run. The UI provides additional options not available via env vars:

- Claim mappings (which OIDC claims map to email, name, nickname)
- Default role for auto-created users
- OIDC-only mode toggle
- Connection testing

## Volumes

| Path | Purpose |
|------|---------|
| `/data` | Database, generated NGINX configs, logs |
| `/etc/letsencrypt` | Let's Encrypt certificates |

## Ports

| Port | Purpose |
|------|---------|
| 80 | HTTP traffic (proxy) |
| 81 | Admin UI + API |
| 443 | HTTPS traffic (proxy) |
