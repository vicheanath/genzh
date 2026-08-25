# Deploying genzh to a home Ubuntu server

A start-to-finish runbook for running the stack on a machine on your own LAN,
using Docker. It assumes nothing has been set up yet.

This is the *local server* path. [README.md](README.md) covers the CI-driven
deploy to a public host; the two share the same compose stack and differ only
in where the images come from and how the box is reached.

**Why a home server is the easy case:** the media server runs with
`network_mode: host`, which needs real Linux — it works here and does not work
on Docker Desktop. And clients on your LAN can reach the SFU directly, so voice
works without a TURN server, which is not true over the internet.

**The one thing that will bite you:** browsers block microphone access on plain
`http://`, so voice will not work on `http://192.168.x.x/` no matter how
correct the rest is. [Step 8](#step-8--https-required-for-voice) fixes that.
Everything else — text chat, presence, the whole app — works over plain HTTP.

---

## Before you start

| | |
|---|---|
| A machine running Ubuntu | 22.04 or 24.04, x86_64 or ARM |
| RAM | 4 GB to build the images, 2 GB to run them |
| Disk | ~20 GB — the Rust build cache is the bulk of it |
| Network | a LAN IP that does not change |

Pin the address first. If your router hands the server a new IP after a reboot,
voice breaks silently — that address gets written into `MEDIA_SERVER_URL` and
browsers dial it directly. Set a DHCP reservation in your router, or configure
a static IP on the box. This runbook uses `192.168.1.50`; substitute yours
everywhere it appears.

---

## Step 1 — Install Docker

On the server:

```bash
curl -fsSL https://get.docker.com | sh
```

Add yourself to the `docker` group so you are not typing `sudo` all day:

```bash
sudo usermod -aG docker $USER
```

Log out and back in for that to take effect, then confirm:

```bash
docker run --rm hello-world
```

If that prints a greeting without `sudo`, you are ready.

---

## Step 2 — Get the code onto the server

You will build the images on the server itself, so it needs the repository:

```bash
sudo mkdir -p /opt/genzh && sudo chown $USER:$USER /opt/genzh
git clone <your-repo-url> /opt/genzh/src
```

> **Prefer to build elsewhere?** If this machine is small, you can let CI build
> the images and pull them instead — see
> [Appendix: pulling from GHCR](#appendix--pulling-images-from-ghcr) and skip
> to Step 4.

---

## Step 3 — Build the three images

```bash
cd /opt/genzh/src
docker build --build-arg RUST_VERSION=1.94 -f Dockerfile.api   -t genzh/api:local   .
docker build --build-arg RUST_VERSION=1.94 -f Dockerfile.media -t genzh/media:local .
docker build -f Dockerfile.web   -t genzh/web:local   .
```

> **Why the `--build-arg`.** The Dockerfiles pin the Rust builder to `1.90` to
> match `rust-version` in the workspace manifest, but `Cargo.lock` carries
> `sqlx 0.9.0`, which requires rustc 1.94. Without the override the API build
> fails with `sqlx-core@0.9.0 requires rustc 1.94.0`. This is real drift in the
> repository, not a quirk of this deployment — the same failure hits CI. The
> proper fix is to raise `rust-version` in `Cargo.toml` and `ARG RUST_VERSION`
> in both Dockerfiles together, after which this override can be dropped.

The two Rust images compile the same dependency graph, so the first is slow
(10–20 minutes cold) and the second is much faster. The build context is the
repository root for all three — `apps/mobile` is excluded by `.dockerignore`,
which is what keeps it from shipping 3 GB of React Native to the daemon.

Confirm all three exist:

```bash
docker images | grep genzh
```

---

## Step 4 — Lay out the runtime directory

The stack runs from its own directory, separate from the source checkout:

```bash
cd /opt/genzh
cp src/deploy/docker-compose.prod.yml src/deploy/deploy.sh src/deploy/env.prod.example .
chmod +x deploy.sh
```

**Then make one edit to `deploy.sh`.** It runs `docker compose pull`, which
fails on images that exist only on this machine and were never pushed to a
registry:

```bash
sed -i 's|^docker compose -f \$COMPOSE_FILE pull$|docker compose -f $COMPOSE_FILE pull --ignore-pull-failures|' deploy.sh
```

Verify it took:

```bash
grep 'pull' deploy.sh
```

You should see `--ignore-pull-failures` on the end. Everything else in that
script — the preflight checks, the readiness wait, the log dump on failure — is
worth keeping, which is why this is a one-line change rather than a rewrite.

---

## Step 5 — Write the configuration

Generate three secrets. Run this and keep the output:

```bash
echo "JWT_SECRET=$(openssl rand -base64 48)"; echo "MEDIA_TOKEN_SECRET=$(openssl rand -base64 48)"; echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)"
```

`JWT_SECRET` and `MEDIA_TOKEN_SECRET` **must be different values**. The API
refuses to start if they match or if either is under 32 characters — a media
server able to forge user sessions would defeat the point of splitting the two
planes apart. Generating them together as above avoids the copy-paste mistake.

Now create `/opt/genzh/.env`:

```bash
cd /opt/genzh && cp env.prod.example .env && nano .env
```

The values that matter:

```ini
# The address browsers use. No scheme, no port, no trailing slash.
DEPLOY_HOST=192.168.1.50
WEB_PORT=80

# Your locally built images from Step 3.
IMAGE_API=genzh/api:local
IMAGE_MEDIA=genzh/media:local
IMAGE_WEB=genzh/web:local

# Paste the three you just generated.
JWT_SECRET=<paste>
MEDIA_TOKEN_SECRET=<paste — must differ from JWT_SECRET>
POSTGRES_USER=social
POSTGRES_PASSWORD=<paste>
POSTGRES_DB=social

APP_ENV=production
# Leave on until you have an account. See Step 7.
ALLOW_PASSWORD_SIGNUP=true

STUN_URL=stun:stun.l.google.com:19302
# Leave TURN empty — on a LAN it is not needed.
TURN_URL=
TURN_USERNAME=
TURN_PASSWORD=

RUST_LOG=info
LOG_FORMAT=json
```

Lock it down — it holds every secret the stack has:

```bash
chmod 600 /opt/genzh/.env
```

---

## Step 6 — Open the firewall

If `ufw` is active:

```bash
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 8081/tcp && sudo ufw allow 32768:60999/udp
```

| Port | Proto | What |
|---|---|---|
| 80 | tcp | the site |
| 8081 | tcp | media signalling |
| 32768–60999 | udp | WebRTC media |
| 22 | tcp | ssh |

The UDP range is Linux's default ephemeral range. `MEDIA_UDP_BIND` is left at
`0.0.0.0:0`, so the kernel picks a fresh port per connection out of that range.
Check yours with `sysctl net.ipv4.ip_local_port_range` — if it differs, allow
what it actually reports. To narrow it you must list addresses explicitly
(`MEDIA_UDP_BIND=0.0.0.0:40000,0.0.0.0:40001,…`); it does not accept a range.

The API (8080) and PostgreSQL (5432) are deliberately never published. Do not
open them.

> **ufw and Docker do not compose the way you would expect.** Docker writes its
> own iptables rules for published ports, so your `ufw` rules do not actually
> gate port 80 — the web container is reachable regardless. They *do* apply to
> the media server, which runs on host networking. On a trusted LAN this is
> mostly harmless; it matters a great deal if you ever expose this box to the
> internet.

---

## Step 7 — Deploy

```bash
cd /opt/genzh && ./deploy.sh
```

The script checks the configuration before touching anything, starts the
stack, waits up to two minutes for the site to answer, and prints what is
running. It is idempotent — safe to re-run any time.

On success you will see the three services plus PostgreSQL, and a `ready` line.
Migrations apply themselves on API startup; there is no separate step.

**Verify from the server:**

```bash
curl -fsS http://127.0.0.1/ >/dev/null && echo "web ok"
```

**Verify from another device on your LAN** — open `http://192.168.1.50/` in a
browser. This is the real test; it proves the bundle is talking to the API
through the nginx proxy rather than to its own localhost.

**Create your account.** `ALLOW_PASSWORD_SIGNUP=true` exists so a fresh box can
make its first account. Sign up through the web UI now.

**Make yourself an admin.** The first one is granted directly in the database,
because there is nobody to grant it yet:

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U social -d social -c "UPDATE users SET platform_role = 'admin' WHERE handle = 'your-handle';"
```

After that, `PUT /admin/users/{id}/platform-role` grants everyone else. Once
you have your account, consider setting `ALLOW_PASSWORD_SIGNUP=false` in `.env`
and re-running `./deploy.sh`, or the instance accepts open signups forever.

---

## Step 8 — HTTPS (required for voice)

Everything works over plain HTTP **except the microphone**. `getUserMedia` only
runs in a secure context, and `http://192.168.1.50/` is not one — the browser
blocks it outright, with no prompt and no error the app can show you. There is
no configuration flag for this; it is a browser rule.

A LAN IP cannot get a normal Let's Encrypt certificate, so the usual answer
does not apply. In rough order of preference:

### Option A — Tailscale (recommended)

Gives you a real, publicly trusted certificate on a `*.ts.net` hostname, plus
access from outside the house, with no port forwarding.

```bash
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
```

Enable **MagicDNS** and **HTTPS Certificates** in the Tailscale admin console,
then note your machine's full name (`myserver.tailnet-name.ts.net`) and issue
a certificate:

```bash
sudo mkdir -p /etc/caddy/tls && sudo tailscale cert --cert-file /etc/caddy/tls/host.crt --key-file /etc/caddy/tls/host.key myserver.tailnet-name.ts.net
```

Install Caddy to terminate TLS for both planes:

```bash
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```caddyfile
myserver.tailnet-name.ts.net {
    tls /etc/caddy/tls/host.crt /etc/caddy/tls/host.key
    reverse_proxy 127.0.0.1:8000
}

# The media plane is separate and must also be TLS — an HTTPS page cannot
# open a plain ws:// socket.
myserver.tailnet-name.ts.net:8443 {
    tls /etc/caddy/tls/host.crt /etc/caddy/tls/host.key
    reverse_proxy 127.0.0.1:8081
}
```

Move the web container off port 80 so Caddy can have it, and point everything
at the new hostname. In `.env`:

```ini
DEPLOY_HOST=myserver.tailnet-name.ts.net
WEB_PORT=8000
FRONTEND_URL=https://myserver.tailnet-name.ts.net
MEDIA_SERVER_URL=wss://myserver.tailnet-name.ts.net:8443/ws/media
```

`MEDIA_SERVER_URL` has to be set explicitly — its default is `ws://`, which an
HTTPS page will refuse as mixed content.

```bash
sudo systemctl reload caddy && cd /opt/genzh && ./deploy.sh
```

Open ports 443 and 8443 in `ufw`, and re-run `tailscale cert` every couple of
months (the certificates are short-lived — a monthly cron entry is enough).

### Option B — a real domain with DNS-01

If you own a domain, Caddy can prove ownership over DNS and issue a
certificate for a hostname that resolves to a private IP. Same Caddyfile shape
as above, minus the manual `tls` lines. Needs a DNS provider plugin.

### Option C — self-signed / mkcert

Works, but every phone, tablet and laptop that connects has to install and
trust your CA. Fine for one machine, tiresome for a household.

---

## Day-to-day

### Updating

```bash
cd /opt/genzh/src && git pull && docker build --build-arg RUST_VERSION=1.94 -f Dockerfile.api -t genzh/api:local . && docker build --build-arg RUST_VERSION=1.94 -f Dockerfile.media -t genzh/media:local . && docker build -f Dockerfile.web -t genzh/web:local . && cd /opt/genzh && ./deploy.sh
```

For rollbacks, tag builds with something meaningful rather than reusing
`:local` — `genzh/api:2026-08-25` — and point `IMAGE_*` at the older tag.
Re-running `deploy.sh` is the whole rollback.

### Logs and health

```bash
cd /opt/genzh
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml exec api curl -s localhost:8080/ready
```

`/ready` reports the database and whether the API knows of a media server. It
is separate from `/health`, which is liveness only.

### Backups

Nobody else is backing this up. The database lives in a Docker volume named
`genzh_postgres-data`; dump it somewhere off the box:

```bash
cd /opt/genzh && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U social social | gzip > ~/genzh-$(date +%F).sql.gz
```

Worth a weekly cron entry, with a copy landing on a different machine.

---

## When something is wrong

| Symptom | Cause |
|---|---|
| API build fails, `sqlx-core@0.9.0 requires rustc 1.94.0` | the `--build-arg RUST_VERSION=1.94` in Step 3 was omitted |
| `deploy.sh` fails on pull | the Step 4 edit did not apply — `grep pull deploy.sh`. As a fallback, skip the script: `docker compose -f docker-compose.prod.yml up -d` |
| API crash-loops at startup | the two secrets match, or one is under 32 characters |
| site loads, API calls 502 | `api` container is down — read its logs |
| site works on the server, not from other devices | firewall, or you used the dev `docker-compose.yml` instead of the prod one |
| chat connects then drops every 60s | a proxy in front with a short read timeout; `deploy/nginx.conf` sets 1h |
| **no microphone prompt at all** | plain HTTP — see [Step 8](#step-8--https-required-for-voice) |
| voice joins, no audio | `MEDIA_SERVER_URL` wrong, or the UDP range is blocked |
| voice works at home, not away | expected — no TURN server. Tailscale sidesteps it |
| IP changed after a reboot | set a DHCP reservation; update `DEPLOY_HOST` and redeploy |

Do not use the repository-root `docker-compose.yml` for this. It is the
development stack: it publishes PostgreSQL to the network, uses `social` as the
database password, and bakes `VITE_API_URL=http://127.0.0.1:8080` into the
bundle — so every other device on your LAN would try to call its own localhost.
`deploy/docker-compose.prod.yml` builds with an empty base URL and proxies
through nginx, which is what makes it work from anywhere.

---

## Appendix — pulling images from GHCR

If you would rather let CI build, push to `main` and let the workflow publish
`ghcr.io/<owner>/<repo>/{api,media,web}`. On the server:

```bash
docker login ghcr.io -u <your-github-username>
```

Use a personal access token with `read:packages` as the password. The
workflow's own `GITHUB_TOKEN` is valid only for the length of a job, so the
server needs its own credential.

Then set `IMAGE_*` in `.env` to the published tags, pinned to a commit SHA
rather than `latest`, and skip the Step 4 `deploy.sh` edit — the pull works
normally.

The workflow's `deploy` job cannot reach a machine behind your home NAT. Leave
the `DEPLOY_HOST` repository *variable* unset and that job skips cleanly while
the build half keeps working; run `./deploy.sh` on the server yourself. If you
want push-to-deploy later, a self-hosted runner on this box or Tailscale in the
workflow both solve it. Forwarding SSH from the internet to your home does not.
