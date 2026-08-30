# Deploying genzh

CI builds two images and pushes them to GitHub Container Registry. LiveKit is
a third, prebuilt one (`livekit/livekit-server`) — nothing this repository
builds. A server runs all of it with `docker compose`. The only thing that
has to know *where* the server is, is one variable: `DEPLOY_HOST`.

```
GitHub Actions                          your server
──────────────                          ───────────
CI  ──▶ test (Rust + PostgreSQL, web)
        │
        ▼
      build ──▶ ghcr.io/<owner>/<repo>/{api,web}:<sha>
        │                                    │
        ▼                                    ▼
      ssh ────────────────────────────▶  docker compose pull && up -d
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                                  web:80    api      postgres
                                  (nginx)  (internal) (internal)
                                    │
                                  livekit  (host network, 7880/7881 tcp + UDP)
```

## Why the web image does not need to know the IP

`apps/web/src/lib/config.ts` falls back to an **empty** API base URL, so the
bundle requests `/api/v1/...` on whatever origin served the page. nginx inside
the web container proxies that to the `api` container.

That has three consequences worth stating plainly:

- One image runs on any host. No rebuild per environment, no `VITE_API_URL`.
- No cross-origin request is ever made, so `CORS_ALLOWED_ORIGINS` stays empty.
- Postgres and the API are never published to the internet. Only port 80 is.

**LiveKit is the exception.** WebRTC needs UDP that genuinely reaches the
browser, so clients dial it directly, and its `node_ip` (written into
`livekit.yaml` by `deploy.sh`, from `DEPLOY_HOST` or `LIVEKIT_NODE_IP` — see
that script) must be a real, dialable IP address. That is the one place
`DEPLOY_HOST` is actually spent beyond building URLs.

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
| 7880 | tcp | everyone — LiveKit signalling (WebSocket) |
| 7881 | tcp | everyone — LiveKit HTTP API |
| 50000–60000 | udp | everyone — WebRTC media |
| 22 | tcp | you |

`8080` (API) and `5432` (PostgreSQL) are deliberately **not** published.

50000–60000 is LiveKit's own default RTC port range —
`deploy/livekit.yaml.template` does not override
`rtc.port_range_start`/`port_range_end`, so this is what it actually uses.
Narrow it there if you want a smaller range open.

> LiveKit runs with `network_mode: host`. Bridge networking cannot give it a
> UDP address a remote peer can reach — it can only advertise one that does
> not work. Host networking or a TURN server; there is no third option. Run
> coturn regardless: without TURN, anyone behind symmetric NAT cannot join
> voice at all.

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
| `LIVEKIT_API_KEY` | `genzh` | default `genzh` — not sensitive, only its secret is |

**Secrets:**

| Name | How |
|---|---|
| `DEPLOY_SSH_KEY` | the private key, whole file including header lines |
| `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -H <ip>` — see the note below |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `LIVEKIT_API_SECRET` | `openssl rand -base64 48` |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | optional |
| `DISCORD_CLIENT_ID` / `_SECRET` | optional |

`LIVEKIT_API_KEY` is a **variable**, not a secret — it is not sensitive, only
the secret it is paired with is. Set it if you want something other than the
`genzh` default; either way it must match whatever a self-hosted LiveKit
elsewhere already expects, if you are pointing at one instead of the `livekit`
service this compose file runs.

`DEPLOY_KNOWN_HOSTS` is optional and the deploy works without it — but without
it the runner accepts whatever host key answers, every run, which is no
verification at all against someone who can route that address. The workflow
prints the keyscan output; save it as this secret to close the gap.

`JWT_SECRET` must be ≥32 characters. The API refuses to start otherwise.

Then push to `main`. That is the whole deploy.

---

## Deploying by hand

The workflow does nothing you cannot do yourself:

```bash
scp deploy/docker-compose.prod.yml deploy/deploy.sh deploy/livekit.yaml.template deploy/env.prod.example \
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

`/ready` reports the database and whether LiveKit is configured; it is the
endpoint to poll, and it is separate from `/health` on purpose.

| Symptom | Cause |
|---|---|
| site loads, API calls 502 | `api` container down — check its logs |
| chat connects then drops every 60s | proxy read timeout; `deploy/nginx.conf` sets 1h |
| join succeeds, permissions look right, no audio/video ever connects | LiveKit's `node_ip` is wrong — check `livekit.yaml` (generated by `deploy.sh`) has the address clients actually dial |
| voice works on LAN, not remotely | no TURN server |
| API crash-loops at startup | `JWT_SECRET` is under 32 characters |
