# genzh — development commands.
#
# `make dev` is the one to remember: it builds the API, then runs the control
# plane and the web client together, with prefixed output and a single
# Ctrl-C that stops both.
#
# LiveKit is not something this Makefile runs — it lives in Docker:
#
#   make docker-infra   # start LiveKit, once, in the background
#   make dev            # run api + web natively, as often as you like
#
# PostgreSQL is a local install, not Docker — `db`/`migrate`/`seed` all
# expect `psql`/`createdb` on PATH and a server already listening wherever
# DATABASE_URL in .env points. Everything here talks to it and to Docker
# LiveKit via DATABASE_URL / LIVEKIT_URL. Running the whole stack — api, web,
# LiveKit *and* Postgres, all in Docker — is the separate `docker-up` target;
# do not run both workflows at once, they will fight over port 5432.

SHELL := /usr/bin/env bash
.SHELLFLAGS := -o pipefail -c
.DEFAULT_GOAL := help

# Ports are the Makefile's to decide, so `make dev API_PORT=9080` genuinely
# moves the server rather than only changing which port gets checked.
#
# The binary reads .env for everything else (dotenvy), and dotenvy never
# overrides a variable already in the environment — so exporting API_BIND
# here wins over .env, and nothing else in .env is disturbed.
API_PORT   ?= 8080
WEB_PORT   ?= 5173
BIND_HOST  ?= 0.0.0.0

export API_BIND := $(BIND_HOST):$(API_PORT)

WEB_DIR := apps/web
MOBILE_DIR := apps/mobile

# Load .env into the recipe's shell without failing when it is absent.
LOAD_ENV = set -a; [[ -f .env ]] && source ./.env; set +a

BOLD  := \033[1m
DIM   := \033[2m
RED   := \033[31m
GREEN := \033[32m
AMBER := \033[33m
RESET := \033[0m

.PHONY: help
help: ## Show this help
	@printf '$(BOLD)genzh$(RESET)  —  make <target>\n\n'
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | sort \
	  | awk -F ':.*?## ' '{ printf "  $(BOLD)%-16s$(RESET) %s\n", $$1, $$2 }'
	@printf '\n$(DIM)First run:  make setup && make docker-infra && make dev$(RESET)\n'

# ── running ─────────────────────────────────────────────────────────────────

.PHONY: dev
dev: ports-free ## Run api + web together (Ctrl-C stops both). LiveKit must already be up — see `docker-infra`.
	@$(MAKE) --no-print-directory check-livekit
	@cargo build -p api
	@printf '\n$(GREEN)api$(RESET) :$(API_PORT)   $(GREEN)web$(RESET) http://localhost:$(WEB_PORT)\n\n'
	@# `kill 0` signals the whole process group, so one Ctrl-C takes down both
	@# children *and* this shell rather than orphaning servers on ports.
	@trap 'trap - INT TERM EXIT; kill 0 2>/dev/null; exit 0' INT TERM EXIT; \
	  ( ./target/debug/api 2>&1 | awk '{ print "\033[35m[api]\033[0m " $$0; fflush() }' ) & \
	  ( cd $(WEB_DIR) && pnpm run dev -- --port $(WEB_PORT) --strictPort 2>&1 \
	      | awk '{ print "\033[32m[web]\033[0m " $$0; fflush() }' ) & \
	  wait

.PHONY: api
api: ## Run the control plane alone
	cargo run -p api

.PHONY: web
web: ## Run the web client alone
	cd $(WEB_DIR) && pnpm run dev -- --port $(WEB_PORT) --strictPort

.PHONY: mobile
mobile: ## Run the Expo mobile client alone
	cd $(MOBILE_DIR) && pnpm start

.PHONY: stop
stop: ## Kill whatever is listening on the api and web ports
	@for port in $(API_PORT) $(WEB_PORT); do \
	  pids=$$(lsof -ti TCP:$$port -sTCP:LISTEN 2>/dev/null); \
	  if [[ -n "$$pids" ]]; then \
	    printf '  stopping :%s (pid %s)\n' "$$port" "$$(echo $$pids | tr '\n' ' ')"; \
	    kill $$pids 2>/dev/null || true; \
	  else \
	    printf '  $(DIM):%s already free$(RESET)\n' "$$port"; \
	  fi; \
	done

.PHONY: ports-free
ports-free: ## Fail if a dev port is already taken
	@busy=0; \
	for port in $(API_PORT) $(WEB_PORT); do \
	  owner=$$(lsof -nP -iTCP:$$port -sTCP:LISTEN 2>/dev/null | awk 'NR==2 { print $$1 " (pid " $$2 ")" }'); \
	  if [[ -n "$$owner" ]]; then \
	    printf '$(RED)port :%s is taken by %s$(RESET)\n' "$$port" "$$owner"; busy=1; \
	  fi; \
	done; \
	if [[ $$busy -eq 1 ]]; then \
	  printf '$(DIM)run `make stop` to free them$(RESET)\n'; exit 1; \
	fi

.PHONY: check-livekit
check-livekit: ## Warn (does not fail) if LiveKit is not reachable at LIVEKIT_URL
	@$(LOAD_ENV); \
	url="$${LIVEKIT_URL:-}"; \
	case "$$url" in \
	  *127.0.0.1*|*localhost*) \
	    http_url=$$(printf '%s' "$$url" | sed -E 's#^wss?://#http://#'); \
	    if ! curl -fsS -m 2 "$$http_url" >/dev/null 2>&1; then \
	      printf '$(AMBER)LiveKit does not appear to be running at %s$(RESET)\n' "$$url"; \
	      printf '$(DIM)start it with: make docker-infra$(RESET)\n\n'; \
	    fi ;; \
	  *) : ;; \
	esac

# ── setup ───────────────────────────────────────────────────────────────────

.PHONY: setup
setup: env install db ## Create .env, install workspace deps, create the database
	@printf '\n$(GREEN)ready$(RESET) — run `make dev`\n'

.PHONY: env
env: ## Create .env from .env.example and generate JWT_SECRET if missing
	@if [[ ! -f .env ]]; then \
	  cp .env.example .env; \
	  printf 'created .env from .env.example\n'; \
	fi
	@# .env.example ships working local defaults for LIVEKIT_API_KEY/SECRET
	@# (devkey/secret) that match docker-infra's LiveKit container, so only
	@# JWT_SECRET — which has no safe default — needs generating here.
	@if ! grep -qE '^JWT_SECRET=.+' .env; then \
	  value=$$(openssl rand -base64 48 | tr -d '\n'); \
	  if grep -qE '^JWT_SECRET=' .env; then \
	    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$$value|" .env && rm -f .env.bak; \
	  else \
	    printf 'JWT_SECRET=%s\n' "$$value" >> .env; \
	  fi; \
	  printf 'generated $(BOLD)JWT_SECRET$(RESET)\n'; \
	fi

.PHONY: install
install: ## Install workspace dependencies (web, mobile, shared)
	pnpm install

.PHONY: db
db: ## Create the database named in DATABASE_URL, if it does not exist
	@$(LOAD_ENV); \
	url="$${DATABASE_URL:-}"; \
	if [[ -z "$$url" ]]; then printf '$(RED)DATABASE_URL is not set in .env$(RESET)\n'; exit 1; fi; \
	name=$${url##*/}; name=$${name%%\?*}; \
	if psql "$$url" -c 'select 1' >/dev/null 2>&1; then \
	  printf '$(GREEN)database "%s" reachable$(RESET)\n' "$$name"; \
	else \
	  printf 'creating database "%s"…\n' "$$name"; \
	  createdb "$$name" 2>/dev/null \
	    || printf '$(AMBER)could not create it — check that PostgreSQL is running$(RESET)\n'; \
	fi

.PHONY: migrate
migrate: ## Apply migrations (the API also does this on startup)
	@$(LOAD_ENV); \
	if command -v sqlx >/dev/null 2>&1; then \
	  sqlx migrate run --database-url "$$DATABASE_URL"; \
	else \
	  printf '$(AMBER)sqlx-cli not installed$(RESET) — the API applies migrations on startup,\n'; \
	  printf 'or: cargo install sqlx-cli --no-default-features --features postgres\n'; \
	fi

.PHONY: seed
seed: ## Populate database with users, communities, playground rooms & friendships
	@$(LOAD_ENV); cargo run --bin seed

# ── quality ─────────────────────────────────────────────────────────────────

.PHONY: check
check: ## Typecheck everything (Rust + TypeScript)
	cargo check --workspace
	cd $(WEB_DIR) && pnpm exec tsc -b

.PHONY: test
test: ## Run the Rust test suite
	cargo test --workspace

.PHONY: test-db
test-db: ## Run the tests that need a database
	@$(LOAD_ENV); TEST_DATABASE_URL="$${TEST_DATABASE_URL:-$$DATABASE_URL}" cargo test --workspace

.PHONY: lint
lint: ## Lint both sides
	cargo clippy --workspace --all-targets -- -D warnings
	cd $(WEB_DIR) && pnpm run lint

.PHONY: fmt
fmt: ## Format Rust code
	cargo fmt --all

.PHONY: build
build: ## Release build of the API and the web bundle
	cargo build --workspace --release
	cd $(WEB_DIR) && pnpm run build

.PHONY: ci
ci: check test lint ## Everything CI would run

# ── diagnostics ─────────────────────────────────────────────────────────────

.PHONY: fingerprints
fingerprints: ## Show the LiveKit key/secret fingerprint .env would sign with
	@printf '$(BOLD)LIVEKIT_API_KEY/SECRET fingerprint$(RESET) $(DIM)(sha256 of "key:secret", first 8 hex)$(RESET)\n\n'
	@$(LOAD_ENV); \
	env_fp=$$(printf '%s:%s' "$${LIVEKIT_API_KEY:-}" "$${LIVEKIT_API_SECRET:-}" | shasum -a 256 | cut -c1-8); \
	printf '  %-14s %s\n' ".env" "$${env_fp:-<unset>}"
	@printf '\n$(DIM)The LiveKit container in `docker-infra` is started with the same two\n'
	@printf 'variables (see docker-compose.yml'"'"'s LIVEKIT_KEYS). If you change either\n'
	@printf 'in .env, recreate it so the fingerprints still agree:\n'
	@printf '  docker compose up -d --force-recreate livekit$(RESET)\n'

.PHONY: doctor
doctor: ## Check tools, secrets, database, LiveKit and ports
	@printf '$(BOLD)tools$(RESET)\n'
	@for tool in cargo node pnpm psql docker; do \
	  if command -v $$tool >/dev/null 2>&1; then \
	    printf '  $(GREEN)✓$(RESET) %-6s %s\n' "$$tool" "$$($$tool --version 2>&1 | head -1)"; \
	  else \
	    printf '  $(RED)✗$(RESET) %-6s not installed\n' "$$tool"; \
	  fi; \
	done
	@printf '\n$(BOLD)configuration$(RESET)\n'
	@if [[ -f .env ]]; then printf '  $(GREEN)✓$(RESET) .env present\n'; \
	 else printf '  $(RED)✗$(RESET) .env missing — run `make env`\n'; fi
	@$(LOAD_ENV); \
	if [[ -z "$${JWT_SECRET:-}" ]]; then \
	  printf '  $(RED)✗$(RESET) JWT_SECRET must be set\n'; \
	elif [[ $${#JWT_SECRET} -lt 32 ]]; then \
	  printf '  $(RED)✗$(RESET) JWT_SECRET must be at least 32 characters\n'; \
	else \
	  printf '  $(GREEN)✓$(RESET) JWT_SECRET set and long enough\n'; \
	fi; \
	if [[ -z "$${LIVEKIT_API_KEY:-}" || -z "$${LIVEKIT_API_SECRET:-}" || -z "$${LIVEKIT_URL:-}" ]]; then \
	  printf '  $(RED)✗$(RESET) LIVEKIT_API_KEY, LIVEKIT_API_SECRET and LIVEKIT_URL must all be set\n'; \
	else \
	  printf '  $(GREEN)✓$(RESET) LiveKit config set  $(DIM)%s$(RESET)\n' "$$LIVEKIT_URL"; \
	fi
	@printf '\n$(BOLD)database$(RESET)\n'
	@$(LOAD_ENV); \
	if [[ -z "$${DATABASE_URL:-}" ]]; then printf '  $(RED)✗$(RESET) DATABASE_URL not set\n'; \
	elif psql "$$DATABASE_URL" -c 'select 1' >/dev/null 2>&1; then \
	  printf '  $(GREEN)✓$(RESET) reachable  $(DIM)%s$(RESET)\n' "$${DATABASE_URL%%\?*}"; \
	else \
	  printf '  $(RED)✗$(RESET) cannot connect  $(DIM)%s$(RESET)\n' "$${DATABASE_URL%%\?*}"; \
	fi
	@printf '\n$(BOLD)livekit$(RESET)\n'
	@$(LOAD_ENV); \
	http_url=$$(printf '%s' "$${LIVEKIT_URL:-}" | sed -E 's#^wss?://#http://#'); \
	if [[ -z "$$http_url" ]]; then printf '  $(RED)✗$(RESET) LIVEKIT_URL not set\n'; \
	elif curl -fsS -m 2 "$$http_url" >/dev/null 2>&1; then \
	  printf '  $(GREEN)✓$(RESET) reachable  $(DIM)%s$(RESET)\n' "$$LIVEKIT_URL"; \
	else \
	  printf '  $(AMBER)○$(RESET) unreachable  $(DIM)%s — try `make docker-infra`$(RESET)\n' "$$LIVEKIT_URL"; \
	fi
	@printf '\n$(BOLD)ports$(RESET)\n'
	@for port in $(API_PORT) $(WEB_PORT); do \
	  owner=$$(lsof -nP -iTCP:$$port -sTCP:LISTEN 2>/dev/null | awk 'NR==2 { print $$1 " (pid " $$2 ")" }'); \
	  if [[ -n "$$owner" ]]; then printf '  $(AMBER)●$(RESET) :%-5s in use by %s\n' "$$port" "$$owner"; \
	  else printf '  $(GREEN)○$(RESET) :%-5s free\n' "$$port"; fi; \
	done
	@printf '\n'
	@$(MAKE) --no-print-directory fingerprints

.PHONY: health
health: ## Curl the API's readiness endpoint
	@printf 'api: '; curl -fsS -m 3 localhost:$(API_PORT)/ready || printf '$(RED)unreachable$(RESET)'; printf '\n'

# ── docker ──────────────────────────────────────────────────────────────────
#
# `docker-infra` is the one `make dev` expects: just LiveKit, in the
# background, nothing built. PostgreSQL is your local install — `docker-infra`
# deliberately does not touch it, and does not start the compose `postgres`
# service, because a local Postgres and a Dockerized one both binding 5432 is
# exactly the kind of silent conflict that looks like a wrong password
# instead of a port fight.
#
# `docker-up` is the other workflow entirely — the whole stack (postgres, api,
# web, seed too) built and run in Docker, no local Rust, Node or PostgreSQL
# install required at all. Pick one; running both against the same ports will
# fight over them.

.PHONY: docker-infra
docker-infra: ## Start LiveKit in Docker — what `make dev` needs (Postgres stays local)
	docker compose up -d livekit
	@printf '\n$(GREEN)livekit$(RESET) :7880 (ws) :7881 (http)\n'
	@printf '$(DIM)now: make dev$(RESET)\n'

.PHONY: docker-infra-down
docker-infra-down: ## Stop LiveKit
	docker compose stop livekit

.PHONY: docker-up
docker-up: ## Start the full stack in Docker (api, web, postgres, livekit)
	docker compose up --build

.PHONY: docker-down
docker-down: ## Stop the Docker stack
	docker compose down

.PHONY: docker-reset
docker-reset: ## Stop the Docker stack and delete its database volume
	docker compose down -v

.PHONY: docker-logs
docker-logs: ## Follow Docker logs
	docker compose logs -f

# ── housekeeping ────────────────────────────────────────────────────────────

.PHONY: clean
clean: ## Remove Rust and web build output
	cargo clean
	rm -rf $(WEB_DIR)/dist $(WEB_DIR)/node_modules/.vite
