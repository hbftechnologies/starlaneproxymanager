# StarlaneProxyManager — Development Dockerfile
# This is used with docker-compose.dev.yml for local development.
# Backend and frontend are mounted as volumes, not copied.

FROM debian:bookworm-slim

ARG TARGETPLATFORM

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_BEHAVIOUR_IF_STAGE2_FAILS=1 \
	S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0 \
	S6_FIX_ATTRS_HIDDEN=1 \
	S6_KILL_FINISH_MAXTIME=10000 \
	S6_VERBOSITY=2 \
	NODE_OPTIONS="--openssl-legacy-provider"

# ── System dependencies ──────────────────────────────────
RUN echo "fs.file-max = 65535" > /etc/sysctl.conf \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends \
		curl ca-certificates gnupg lsb-release \
		jq logrotate moreutils openssl \
		python3 python3-pip python3-venv \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

# ── NGINX from official repo ───────────────────────────
RUN curl -fsSL https://nginx.org/keys/nginx_signing.key \
		| gpg --dearmor -o /etc/apt/trusted.gpg.d/nginx-signing.gpg \
	&& echo "deb https://nginx.org/packages/debian/ bookworm nginx" \
		> /etc/apt/sources.list.d/nginx.list \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends nginx \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

# ── Node.js 20 ──────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
	&& apt-get install -y --no-install-recommends nodejs \
	&& npm install -g yarn \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

# ── Certbot ─────────────────────────────────────────────
RUN python3 -m venv /opt/certbot \
	&& /opt/certbot/bin/pip install --no-cache-dir certbot certbot-dns-cloudflare \
	&& ln -sf /opt/certbot/bin/certbot /usr/bin/certbot

# ── Task runner (dev tool) ──────────────────────────────
WORKDIR /usr
RUN curl -sL https://taskfile.dev/install.sh | sh
WORKDIR /root

# ── s6-overlay ──────────────────────────────────────────
COPY scripts/install-s6 /tmp/install-s6
RUN /tmp/install-s6 "${TARGETPLATFORM}" && rm -f /tmp/install-s6

# ── Rootfs (s6 services, nginx configs, scripts) ─────────
COPY rootfs /

# ── Dev cleanup ─────────────────────────────────────────
RUN rm -f /etc/nginx/conf.d/production.conf \
	&& chmod 644 /etc/logrotate.d/starlane-proxy-manager \
	&& chmod 644 -R /root/.cache

EXPOSE 80 81 443
ENTRYPOINT [ "/init" ]
