#!/usr/bin/env bash
#
# Bring the stack up on a server. Runs *on the server*, from the directory
# holding docker-compose.prod.yml, .env and livekit.yaml.template — the
# deploy workflow scp's all three there and then runs this, and a human can
# do exactly the same by hand.
#
#   ./deploy.sh
#
# Idempotent: safe to run repeatedly, and re-running with different IMAGE_*
# values in .env is how you roll forward or back.

set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILE=docker-compose.prod.yml
ENV_FILE=.env

# ── preflight ───────────────────────────────────────────────────────────────
# Every one of these fails confusingly and late if it is left to compose, so
# it is checked loudly and early instead.

[[ -f $COMPOSE_FILE ]] || { echo "missing $COMPOSE_FILE" >&2; exit 1; }
[[ -f $ENV_FILE ]]     || { echo "missing $ENV_FILE — copy env.prod.example" >&2; exit 1; }
[[ -f livekit.yaml.template ]] || { echo "missing livekit.yaml.template" >&2; exit 1; }

set -a; source ./$ENV_FILE; set +a

fail=0
need() {
  if [[ -z "${!1:-}" ]]; then
    printf 'missing %s — %s\n' "$1" "$2" >&2
    fail=1
  fi
}

# Checked here rather than with compose's `${VAR:?}` because an empty
# DEPLOY_HOST interpolates into `ws://:7880`, which starts fine and then
# breaks only voice, only for real users, with no error in the logs.
need DEPLOY_HOST      "the address browsers use to reach this server"
need JWT_SECRET       "openssl rand -base64 48"
need LIVEKIT_API_KEY  "any short identifier — see env.prod.example"
need LIVEKIT_API_SECRET "openssl rand -base64 48"
need POSTGRES_PASSWORD "openssl rand -base64 24"
need IMAGE_API        "written by CI; see env.prod.example"
need IMAGE_WEB        "written by CI; see env.prod.example"
[[ $fail -eq 0 ]] || exit 1

# The API refuses to start if this is short. Saying so here turns a
# crash-loop into one line of output.
if (( ${#JWT_SECRET} < 32 )); then
  echo "JWT_SECRET must be at least 32 characters" >&2
  exit 1
fi

# LiveKit's node_ip has to be a real IP, not a URL — generated fresh each
# deploy rather than committed, since it is specific to this server. DEPLOY_HOST
# is that IP directly on a plain LAN deploy, but becomes a hostname (a Tailscale
# *.ts.net name, say) once Step 8 is in play — LIVEKIT_NODE_IP exists for
# exactly that case; leave it unset and this falls back to DEPLOY_HOST.
echo "==> writing livekit.yaml"
sed "s/DEPLOY_HOST_PLACEHOLDER/${LIVEKIT_NODE_IP:-$DEPLOY_HOST}/" livekit.yaml.template > livekit.yaml

# ── deploy ──────────────────────────────────────────────────────────────────

echo "==> pulling images"
docker compose -f $COMPOSE_FILE pull

echo "==> starting"
# --remove-orphans so a service removed from the compose file actually stops
# rather than lingering from a previous release.
docker compose -f $COMPOSE_FILE up -d --remove-orphans

# ── verify ──────────────────────────────────────────────────────────────────
# `up -d` returning 0 only means the containers were created. It says nothing
# about whether the API connected to PostgreSQL or the migrations applied, and
# a deploy that reports success while /ready is red is worse than a failure.

echo "==> waiting for readiness"
ready=0
for i in $(seq 1 60); do
  # Probed through the published web port, which is the path a real user
  # takes — it proves nginx, the compose network and the API all work, not
  # just that a process is listening somewhere.
  if curl -fsS -m 3 "http://127.0.0.1:${WEB_PORT:-80}/" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [[ $ready -ne 1 ]]; then
  echo "web did not become reachable in 120s" >&2
  docker compose -f $COMPOSE_FILE ps
  docker compose -f $COMPOSE_FILE logs --tail 50
  exit 1
fi

# The API's own readiness endpoint reports the truth about the database and
# whether LiveKit is configured. It is not proxied under /api, so it is
# reached inside the network.
api_ready=$(docker compose -f $COMPOSE_FILE exec -T api \
  curl -fsS -m 3 http://127.0.0.1:8080/ready 2>/dev/null || echo '')

echo
echo "==> deployed"
docker compose -f $COMPOSE_FILE ps
echo
echo "  web      http://${DEPLOY_HOST}:${WEB_PORT:-80}/"
echo "  livekit  ws://${DEPLOY_HOST}:7880"
echo "  ready    ${api_ready:-<no answer from /ready — run: docker compose -f $COMPOSE_FILE logs api>}"

# Old image layers accumulate fast with two images per deploy.
docker image prune -f >/dev/null 2>&1 || true
