# Self-hosting genzh behind a Cloudflare Tunnel

How to run the whole stack on a Linux box at home or in an office and reach it
from the internet through a Cloudflare Tunnel — without opening a port on the
router.

Read [the caveat about voice](#the-part-a-tunnel-cannot-carry) before you start.
Chat, presence, notifications and screen-share *signalling* all work perfectly
over a tunnel. The audio and video themselves do not, and the fix is a TURN
server rather than anything in this repository.

---

## What you are deploying

Four processes. Only the first three need to be reachable from a browser.

| Service    | Port   | Protocol                    | What it is                                  |
| ---------- | ------ | --------------------------- | ------------------------------------------- |
| `web`      | 8082   | HTTP                        | nginx serving the built SPA                 |
| `api`      | 8080   | HTTP + WebSocket            | Control plane. Chat, presence, notifications |
| `media`    | 8081   | HTTP + WebSocket, plus UDP  | The SFU. Signalling on 8081, media over UDP |
| `postgres` | 5432   | TCP                         | Database. Never exposed publicly            |

The API and the media server share nothing but a signing secret. The media
server has no database credentials and never sees a user's JWT — it trusts only
short-lived tokens minted by the API. That split is why there are two secrets
below and why they must differ.

---

## 1. Prerequisites

On the Linux server:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker "$USER"   # log out and back in for this to take effect
```

Install `cloudflared` from Cloudflare's repository:

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared
```

You also need a domain on Cloudflare with the nameservers already pointed at
them. Everything below assumes `example.com`; substitute your own.

---

## 2. Pick three hostnames

One per browser-facing service. Subdomains of a domain in your Cloudflare
account — you do **not** create DNS records by hand, `cloudflared` does it.

| Hostname              | Points at              |
| --------------------- | ---------------------- |
| `app.example.com`     | `http://localhost:8082` |
| `api.example.com`     | `http://localhost:8080` |
| `media.example.com`   | `http://localhost:8081` |

Three rather than one path-routed hostname because the web bundle is served by
nginx with an SPA fallback: any path it does not recognise returns `index.html`,
which would swallow `/api/...` if they shared an origin.

---

## 3. Configure the application

```bash
git clone <your-fork> genzh && cd genzh
cp .env.example .env
```

Generate the two secrets. They must be at least 32 characters and must differ
from each other — the API refuses to start otherwise, because one key able to
forge the other's tokens defeats the whole split:

```bash
printf 'JWT_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n')" >> .env
printf 'MEDIA_TOKEN_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n')" >> .env
```

Then edit `.env` so every URL is the public one. These are the lines that matter
for a tunnel; the rest of `.env.example` can stay as it is.

```bash
APP_ENV=production

# Where the browser sends API calls. Baked into the web bundle at build time.
VITE_API_URL=https://api.example.com

# Where the browser dials the SFU. Note wss, not ws — the page is HTTPS, and a
# browser refuses a plaintext WebSocket from a secure page.
MEDIA_SERVER_URL=wss://media.example.com/ws/media

# Where OAuth sends people back to, and which origin may call the API.
FRONTEND_URL=https://app.example.com
CORS_ALLOWED_ORIGINS=https://app.example.com

# Only if you use social sign-in. These must also be registered, character for
# character, in the Google and Discord developer consoles.
GOOGLE_REDIRECT_URI=https://api.example.com/api/v1/auth/oauth/google/callback
DISCORD_REDIRECT_URI=https://api.example.com/api/v1/auth/oauth/discord/callback
```

> **`VITE_API_URL` is compiled in, not read at runtime.** A static SPA has no
> server to read an environment variable at request time, so changing it means
> rebuilding the `web` image: `docker compose build web`. If the app loads but
> every request fails against `127.0.0.1:8080`, this is why.

---

## 4. Start the stack

```bash
docker compose up -d --build
```

The API applies database migrations on startup (`RUN_MIGRATIONS=true`), so there
is no separate migration step.

Check it locally before involving Cloudflare — if this fails, a tunnel will only
add a second thing to debug:

```bash
curl -fsS http://localhost:8080/ready && echo " api ok"
curl -fsS http://localhost:8081/ready && echo " media ok"
curl -fsSI http://localhost:8082/ | head -1
```

---

## 5. Create the tunnel

```bash
cloudflared tunnel login          # opens a browser to authorise the domain
cloudflared tunnel create genzh   # prints a tunnel UUID and writes a credentials file
```

Route each hostname to the tunnel. This is what creates the DNS records:

```bash
cloudflared tunnel route dns genzh app.example.com
cloudflared tunnel route dns genzh api.example.com
cloudflared tunnel route dns genzh media.example.com
```

Write `/etc/cloudflared/config.yml`, substituting the UUID that `create` printed:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /root/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: app.example.com
    service: http://localhost:8082

  - hostname: api.example.com
    service: http://localhost:8080

  - hostname: media.example.com
    service: http://localhost:8081

  # Every ingress list must end with a catch-all, or cloudflared refuses to
  # start.
  - service: http_status:404
```

WebSockets need no special configuration — `cloudflared` proxies them over the
same ingress rule as ordinary HTTP. Both `/api/v1/ws` and `/ws/media` work
through this as written.

Install it as a service so it survives a reboot:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

Visit `https://app.example.com`. You should be able to register, sign in, create
a community, and chat in real time.

---

## The part a tunnel cannot carry

**Text chat, presence, notifications and mentions all work over the tunnel.
Voice, video and screen sharing will not — for anyone outside your LAN.**

A Cloudflare Tunnel carries HTTP and WebSocket traffic. WebRTC media is neither:
once signalling has finished, the browser sends audio and video as SRTP over UDP
directly to the SFU. That traffic never enters the tunnel, so it has no route to
your server.

What this looks like in practice: people join the room, see each other in the
participant list, see the speaking indicators and the "sharing" badge — and hear
silence. The signalling all succeeded; only the media has nowhere to go.

### The fix: a TURN server

TURN relays media through a host that both sides *can* reach. Run
[coturn](https://github.com/coturn/coturn) on any small public VPS — not behind
the tunnel, since the whole point is that it is directly reachable:

```bash
# On a public VPS, with UDP 3478 and 49152-65535 open.
sudo apt install -y coturn
```

`/etc/turnserver.conf`:

```conf
listening-port=3478
fingerprint
lt-cred-mech
user=genzh:<a-long-random-password>
realm=turn.example.com
# The VPS's own addresses. TURN advertises these, so they must be right.
listening-ip=0.0.0.0
external-ip=<VPS-PUBLIC-IP>
```

Then point both planes at it in `.env` and restart:

```bash
TURN_URL=turn:turn.example.com:3478
TURN_USERNAME=genzh
TURN_PASSWORD=<the same long random password>

# Optional. Skips candidate types that cannot work in this topology, so calls
# connect faster instead of waiting for direct paths to time out.
ICE_RELAY_ONLY=true
```

Both the API and the media server read these — the API hands them to browsers,
and the SFU uses them for its own connections.

### Why you cannot just forward the UDP ports

Two reasons, and both are worth knowing before you try:

- **The SFU does not advertise a public address.** `MEDIA_PUBLIC_IP` appears in
  a source comment but is not implemented anywhere — the SFU advertises the
  addresses it binds, which behind NAT means a private `192.168.x.x` no remote
  browser can reach. A STUN server lets it discover its public mapping, but on
  most consumer routers that mapping is not stable enough to rely on.
- **The ports are not fixed.** `MEDIA_UDP_BIND` takes an explicit list of socket
  addresses, and the default `0.0.0.0:0` lets the OS choose a fresh port per
  connection. You can pin specific ports by listing them, but the list is a hard
  cap on concurrent connections rather than a range.

TURN sidesteps both. It is the ordinary answer for any SFU behind NAT, not a
workaround for something unusual about this stack.

### If everyone is on your LAN

Voice works with no TURN server and no tunnel at all, because the SFU's own
address is directly reachable. Point the clients at the LAN address instead:

```bash
VITE_API_URL=http://192.168.1.50:8080
MEDIA_SERVER_URL=ws://192.168.1.50:8081/ws/media
FRONTEND_URL=http://192.168.1.50:8082
CORS_ALLOWED_ORIGINS=http://192.168.1.50:8082
```

Note the plain `ws://` and `http://` — consistent with a non-HTTPS origin.
Browsers treat `localhost` as a secure context but a bare LAN IP is not one, so
microphone and camera access will be blocked over plain HTTP from another
machine. For a LAN deployment you still want TLS, which is its own exercise.

---

## Operating it

**Logs.**

```bash
docker compose logs -f api media
sudo journalctl -u cloudflared -f
```

**Updating.** The web image has the API URL compiled in, so it must be rebuilt
whenever that changes — `--build` covers both cases:

```bash
git pull && docker compose up -d --build
```

**Backups.** Everything durable is in Postgres:

```bash
docker compose exec -T postgres pg_dump -U social social | gzip > "genzh-$(date +%F).sql.gz"
```

**Rotating secrets.** Changing `JWT_SECRET` signs everyone out, which is the
point of rotating it. Changing `MEDIA_TOKEN_SECRET` requires restarting the API
and the media server *together* — if they disagree, the media server rejects
every token and voice fails with "the voice server rejected this session".
`make fingerprints` compares the two without printing them.

---

## When something is wrong

| What you see | Where to look |
| --- | --- |
| Page loads, every request fails against `127.0.0.1:8080` | `VITE_API_URL` was not set at build time. `docker compose build web` |
| Requests blocked by CORS in the browser console | `CORS_ALLOWED_ORIGINS` must be the exact origin, scheme included, no trailing slash |
| Sign-in redirects to `localhost` | `FRONTEND_URL`, and the redirect URIs registered with Google/Discord |
| Voice connects then drops, or connects silently | Almost always the UDP problem above. Configure TURN |
| "The voice server rejected this session" | `MEDIA_TOKEN_SECRET` differs between the two processes. `make fingerprints` |
| `cloudflared` will not start | The ingress list must end with a catch-all rule |
| WebSocket fails but plain requests work | `MEDIA_SERVER_URL` is `ws://` on an HTTPS page. It must be `wss://` |

---

## A note on exposure

A Cloudflare Tunnel puts a registration form on the public internet. Before you
share the hostname:

- Set `ALLOW_PASSWORD_SIGNUP=false` if you only want people arriving through
  Google or Discord.
- Keep `RATE_LIMIT_PER_MINUTE` and `AUTH_RATE_LIMIT_PER_MINUTE` at their
  defaults or lower; the auth limit exists because every attempt costs an Argon2
  hash.
- Consider a Cloudflare Access policy in front of `app.example.com` while the
  deployment is still private. It sits outside the app entirely, so it needs no
  changes here.
