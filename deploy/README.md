# Deploying genzh

CI builds three images and pushes them to GitHub Container Registry. A server
runs them with `docker compose`. The only thing that has to know *where* the
server is, is one variable: `DEPLOY_HOST`.

```
GitHub Actions                          your server
──────────────                          ───────────
CI  ──▶ test (Rust + PostgreSQL, web)
        │
        ▼
      build ──▶ ghcr.io/<owner>/<repo>/{api,media,web}:<sha>
        │                                    │
        ▼                                    ▼
      ssh ────────────────────────────▶  docker compose pull && up -d
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                                  web:80    api      postgres
                                  (nginx)  (internal) (internal)
                                    │
                                  media  (host network, 8081/tcp + UDP)
```

## Why the web image does not need to know the IP

`apps/web/src/lib/config.ts` falls back to an **empty** API base URL, so the
bundle requests `/api/v1/...` on whatever origin served the page. nginx inside
the web container proxies that to the `api` container.

That has three consequences worth stating plainly:

- One image runs on any host. No rebuild per environment, no `VITE_API_URL`.
- No cross-origin request is ever made, so `CORS_ALLOWED_ORIGINS` stays empty.
- Postgres and the API are never published to the internet. Only port 80 is.

The **media** plane is the exception. WebRTC needs UDP that genuinely reaches
the browser, so clients dial the SFU directly and `MEDIA_SERVER_URL` must
contain a real address. That is the one place `DEPLOY_HOST` is actually spent.

---

## One-time server setup

Any Ubuntu/Debian box with a public IP. As root:

```bash
curl -fsSL https://get.docker.com | sh
useradd -m -s /bin/bash deploy && usermod -aG docker deploy
mkdir -p /opt/genzh && chown deploy:deploy /opt/genzh
```

Add the public half of a deploy keypair to `/home/deploy/.ssh/authorized_keys`.
Generate one with `ssh-keygen -t ed25519 -f deploy_key -N ''` — the private
half becomes the `DEPLOY_SSH_KEY` secret below.

Open these ports:

| Port | Proto | Who |
|---|---|---|
| 80 | tcp | everyone — the site |
| 8081 | tcp | everyone — media signalling |
| 32768–60999 | udp | everyone — WebRTC media |
| 22 | tcp | you |

`8080` (API) and `5432` (PostgreSQL) are deliberately **not** published.

The UDP range is Linux's default ephemeral range, because `MEDIA_UDP_BIND` is
left at `0.0.0.0:0` and the SFU lets the kernel pick a port per connection.
`MEDIA_UDP_BIND` takes a comma-separated list of explicit addresses, not a
range, so narrowing the firewall means listing them:
`MEDIA_UDP_BIND=0.0.0.0:40000,0.0.0.0:40001,…`. Check the host's actual range
with `sysctl net.ipv4.ip_local_port_range`.

> The media container runs with `network_mode: host`. Bridge networking cannot
> give an SFU a UDP address a remote peer can reach — it can only advertise one
> that does not work. Host networking or a TURN server; there is no third
> option. Run coturn regardless: without TURN, anyone behind symmetric NAT
> cannot join voice at all.

---

## Point CI at the server

In **Settings → Secrets and variables → Actions**:

**Variables** (not secrets — the job's `if:` reads `DEPLOY_HOST` before any
environment is resolved, so it must be a *repository* variable):

| Name | Example | |
|---|---|---|
| `DEPLOY_HOST` | `203.0.113.10` | **required** — turns the deploy job on |
| `DEPLOY_USER` | `deploy` | default `deploy` |
| `DEPLOY_DIR` | `/opt/genzh` | default `/opt/genzh` |
| `DEPLOY_SSH_PORT` | `22` | default `22` |
| `WEB_PORT` | `80` | default `80` |
| `ALLOW_PASSWORD_SIGNUP` | `true` | set `false` once OAuth works |

**Secrets:**

| Name | How |
|---|---|
| `DEPLOY_SSH_KEY` | the private key, whole file including header lines |
| `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -H <ip>` — see the note below |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `MEDIA_TOKEN_SECRET` | `openssl rand -base64 48` — **must differ** from the above |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | optional |
| `DISCORD_CLIENT_ID` / `_SECRET` | optional |
| `TURN_URL` / `TURN_USERNAME` / `TURN_PASSWORD` | strongly recommended |

`DEPLOY_KNOWN_HOSTS` is optional and the deploy works without it — but without
it the runner accepts whatever host key answers, every run, which is no
verification at all against someone who can route that address. The workflow
prints the keyscan output; save it as this secret to close the gap.

The two secrets must differ and each be ≥32 characters. The API refuses to
start otherwise: a media server able to forge user sessions would defeat the
point of splitting the planes.

Then push to `main`. That is the whole deploy.

---

## Deploying by hand

The workflow does nothing you cannot do yourself:

```bash
scp deploy/docker-compose.prod.yml deploy/deploy.sh deploy/env.prod.example \
    deploy@<ip>:/opt/genzh/
ssh deploy@<ip>
cd /opt/genzh
cp env.prod.example .env   # then fill it in — DEPLOY_HOST first
./deploy.sh
```

`deploy.sh` checks the environment before touching anything, pulls, starts,
waits for the site to answer, and prints what is running. It is idempotent.

## Rolling back

Every image is tagged with its commit SHA, so a rollback is an edit:

```bash
ssh deploy@<ip> 'cd /opt/genzh && sed -i "s/:[0-9a-f]\{40\}/:<older-sha>/g" .env && ./deploy.sh'
```

Or re-run the Deploy workflow from the older commit with **skip_tests** on.

## When something is wrong

```bash
cd /opt/genzh
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml exec api curl -s localhost:8080/ready
```

`/ready` reports the database and whether the API knows of a media server; it
is the endpoint to poll, and it is separate from `/health` on purpose.

| Symptom | Cause |
|---|---|
| site loads, API calls 502 | `api` container down — check its logs |
| chat connects then drops every 60s | proxy read timeout; `deploy/nginx.conf` sets 1h |
| voice joins, no audio | `MEDIA_SERVER_URL` wrong, or UDP blocked. `DEPLOY_HOST` must be the address a *browser* uses |
| voice works on LAN, not remotely | no TURN server |
| API crash-loops at startup | the two secrets match, or one is under 32 chars |
