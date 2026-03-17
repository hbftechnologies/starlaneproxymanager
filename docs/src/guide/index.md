---
outline: deep
---

# Guide

This project comes as a pre-built docker image that enables you to easily forward to your websites
running at home or otherwise, including free SSL, without having to know too much about Nginx or Letsencrypt.

- [Quick Setup](#quick-setup)
- [Full Setup](/setup/)
- [Screenshots](/screenshots/)

## Project Goal

Starlane Proxy Manager is a fork of [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) designed to provide users with an easy way to accomplish reverse
proxying hosts with SSL termination. The goal is simplicity — it should be so easy that a monkey could do it. While there might be advanced options they are optional and the project should be as simple as possible
so that the barrier for entry here is low.

## Features

- Beautiful and Secure Admin Interface based on [Tabler](https://tabler.io/)
- Easily create forwarding domains, redirections, streams and 404 hosts without knowing anything about Nginx
- Free SSL using Let's Encrypt or provide your own custom SSL certificates
- Access Lists and basic HTTP Authentication for your hosts
- Advanced Nginx configuration available for super users
- User management, permissions and audit log


## Hosting your home network

I won't go in to too much detail here but here are the basics for someone new to this self-hosted world.

1. Your home router will have a Port Forwarding section somewhere. Log in and find it
2. Add port forwarding for port 80 and 443 to the server hosting this project
3. Configure your domain name details to point to your home, either with a static ip or a service like DuckDNS or [Amazon Route53](https://github.com/jc21/route53-ddns)
4. Use Starlane Proxy Manager as your gateway to forward to your other web based services

## Quick Setup

1. Install Docker and Docker-Compose

- [Docker Install documentation](https://docs.docker.com/get-docker/)
- [Docker-Compose Install documentation](https://docs.docker.com/compose/install/)

2. Create a docker-compose.yml file similar to this:

```yml
services:
  app:
    image: 'starlane-proxy-manager:latest'
    restart: unless-stopped
    environment:
      TZ: "America/Chicago"
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

This is the bare minimum configuration required. See the [setup documentation](/setup/) for more.

3. Bring up your stack by running

```bash
docker compose up -d
```

4. Log in to the Admin UI

When your docker container is running, connect to it on port `81` for the admin interface.

[http://127.0.0.1:81](http://127.0.0.1:81)

This startup can take a minute depending on your hardware.


## Contributing

All are welcome to create pull requests for this project, against the `develop` branch.


## Getting Support

1. [Found a bug?](https://gitea.2eagles.xyz/hft-applications/StarlaneProxyManager/issues)
