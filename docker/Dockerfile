# StarlaneProxyManager Dockerfile
#
# Build:  docker build -f docker/Dockerfile -t starlane-proxy-manager .
# Buildx: docker buildx build --platform linux/amd64,linux/arm64 -f docker/Dockerfile -t starlane-proxy-manager .
#
# This file assumes the frontend has been pre-built (./scripts/frontend-build)

# ── Stage 1: Frontend build ──────────────────────────────
FROM node:26-bookworm-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000
COPY frontend/ .
RUN yarn locale-compile && yarn build

# ── Stage 2: Production image ────────────────────────────
FROM debian:bookworm-slim

ARG TARGETPLATFORM
ARG BUILD_VERSION
ARG BUILD_COMMIT
ARG BUILD_DATE

# ── s6-overlay settings ──────────────────────────────────
ENV SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_BEHAVIOUR_IF_STAGE2_FAILS=1 \
	S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0 \
	S6_FIX_ATTRS_HIDDEN=1 \
	S6_KILL_FINISH_MAXTIME=10000 \
	S6_VERBOSITY=1 \
	NODE_ENV=production \
	NPM_BUILD_VERSION="${BUILD_VERSION}" \
	NPM_BUILD_COMMIT="${BUILD_COMMIT}" \
	NPM_BUILD_DATE="${BUILD_DATE}" \
	NODE_OPTIONS="--openssl-legacy-provider"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# ── Install system dependencies ──────────────────────────
RUN echo "fs.file-max = 65535" > /etc/sysctl.conf \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends \
		curl ca-certificates gnupg lsb-release xz-utils \
		figlet jq logrotate openssl \
		python3 python3-pip python3-venv \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

# ── Install NGINX from official repo ──────────────────────
RUN curl -fsSL https://nginx.org/keys/nginx_signing.key \
		| gpg --dearmor -o /etc/apt/trusted.gpg.d/nginx-signing.gpg \
	&& echo "deb https://nginx.org/packages/debian/ bookworm nginx" \
		> /etc/apt/sources.list.d/nginx.list \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends nginx \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

# ── Install Node.js 20 ──────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
	&& apt-get install -y --no-install-recommends nodejs \
	&& npm install -g yarn \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

# ── Install certbot ─────────────────────────────────────
RUN python3 -m venv /opt/certbot \
	&& /opt/certbot/bin/pip install --no-cache-dir certbot certbot-dns-cloudflare \
	&& ln -sf /opt/certbot/bin/certbot /usr/bin/certbot

# ── Install s6-overlay ──────────────────────────────────
COPY docker/scripts/install-s6 /tmp/install-s6
RUN /tmp/install-s6 "${TARGETPLATFORM}" && rm -f /tmp/install-s6

EXPOSE 80 81 443

# ── Copy backend and install deps ────────────────────────
COPY backend /app
COPY --from=frontend-build /build/dist /app/frontend

WORKDIR /app
RUN yarn install --production \
	&& yarn cache clean

# ── Copy rootfs (s6 services, nginx configs, scripts) ────
COPY docker/rootfs /

# ── Production cleanup ──────────────────────────────────
RUN rm -rf /etc/s6-overlay/s6-rc.d/user/contents.d/frontend \
		/etc/nginx/conf.d/dev.conf \
	&& chmod 644 /etc/logrotate.d/starlane-proxy-manager

VOLUME [ "/data" ]
ENTRYPOINT [ "/init" ]

LABEL org.label-schema.schema-version="1.0" \
	org.label-schema.license="MIT" \
	org.label-schema.name="starlane-proxy-manager" \
	org.label-schema.description="Reverse proxy management UI — a fork of Nginx Proxy Manager" \
	org.label-schema.url="https://gitea.2eagles.xyz/hft-applications/StarlaneProxyManager" \
	org.label-schema.vcs-url="https://gitea.2eagles.xyz/hft-applications/StarlaneProxyManager.git"
