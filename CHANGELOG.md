# Changelog

All notable changes to StarlaneProxyManager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffolding and hygiene files (.gitignore, .dockerignore, .env.example)
- Production and development docker-compose files
- Project README with architecture overview and roadmap
- Multi-stage Dockerfile with debian:bookworm-slim base
- NGINX installation from official `nginx.org` repository
- Node.js 20, certbot (venv), s6-overlay in production image
- StarlaneProxyManager branding (banner, default page, labels)
- `yarn locale-compile` step in Dockerfile frontend build stage
- Full rebrand across frontend, backend, 21 i18n locale files, 21 HelpDoc files, docs site
- Dual-version system: SPM version (1.0.0) + NPM base version (2.14.0)
- API schema endpoint `GET /api/schema` — OpenAPI 3.1.0 (44 paths, 68 operations, 12 tags)
- Swagger UI via docker compose `--profile docs` at port 8082 (dev) / 82 (prod)
- CORS configured for Swagger UI origin
- Fixed `backend/routes/schema.js` missing `next` parameter (upstream bug)
- MFA (TOTP) verified and rebranded from upstream — fully functional
- Port 82 mapping in docker-compose.yml for API documentation
- About modal (`AboutModal.tsx`) with SPM version, NPM base version, fork attribution, MIT license, maintainer info, and repo links
- "About" link in site footer (after version number)
- 7 `about.*` locale keys added to all 21 language files

### Changed

- Forked from NGINX Proxy Manager v2.14.0 (develop branch)
- **Dockerfile**: Replaced `nginxproxymanager/nginx-full` base with `debian:bookworm-slim` + NGINX from official repo
- **Logrotate**: Renamed config to `starlane-proxy-manager`
- **Server names**: Updated from `nginxproxymanager` to `starlaneproxymanager` in conf.d files
- Footer update link relabeled as "NPM Base Update" (distinguishes from future SPM update mechanism)
- Removed Google Analytics from docs site config
- **Implementation plan**: Expanded v1.0.0 scope to include OIDC/SSO, audit log enhancements, NGINX access log viewer, import/export, and About modal

### Preserved (intentional)

- `/data/nginx/` data paths — avoids database migration
- `/api/nginx/` API routes — maintains backward compatibility
- `NPM_BUILD_*` env vars — backward compatibility
- DB user/password examples as "npm" in docs — backward compat with existing configs
- Certbot for certificate management

### Reverted

- Removed Angie web server — reverted back to NGINX due to unreliable Russian-hosted infrastructure

## [1.0.0] - Unreleased

### Planned

- Swagger UI served in-app at `/api-docs`
- OIDC/SSO authentication (Authentik, Keycloak)
- Enhanced audit logging (pagination, filtering, export)
- NGINX access log viewer per proxy host
- Proxy host import/export and NPM migration tools
