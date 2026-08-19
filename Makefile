# genzh — development commands.
#
# `make dev` is the one to remember: it builds both Rust binaries, then runs the
# control plane, the media plane and the web client together, with prefixed
# output and a single Ctrl-C that stops all three.
#
# Everything here talks to your local PostgreSQL via DATABASE_URL in .env. The
# Docker path is separate and lives under the `docker-*` targets.

SHELL := /usr/bin/env bash
.SHELLFLAGS := -o pipefail -c
.DEFAULT_GOAL := help

# Ports are the Makefile's to decide, so `make dev API_PORT=9080` genuinely
# moves the server rather than only changing which port gets checked.
#
# The binaries read .env for everything else (dotenvy), and dotenvy never
# overrides a variable already in the environment — so exporting the two BIND
# addresses here wins over .env, and nothing else in .env is disturbed.
API_PORT   ?= 8080
MEDIA_PORT ?= 8081
WEB_PORT   ?= 5173
BIND_HOST  ?= 0.0.0.0

export API_BIND   := $(BIND_HOST):$(API_PORT)
export MEDIA_BIND := $(BIND_HOST):$(MEDIA_PORT)

WEB_DIR := apps/web

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
	@printf '\n$(DIM)First run:  make setup && make dev$(RESET)\n'

# ── running ─────────────────────────────────────────────────────────────────

.PHONY: dev
dev: ports-free ## Run api + media + web together (Ctrl-C stops all)
	@printf '$(DIM)Building both binaries first — two concurrent `cargo run`s\n'
	@printf 'would otherwise block on the same build lock.$(RESET)\n'
	@cargo build -p api -p media
	@printf '\n$(GREEN)api$(RESET) :$(API_PORT)   $(GREEN)media$(RESET) :$(MEDIA_PORT)   $(GREEN)web$(RESET) http://localhost:$(WEB_PORT)\n\n'
	@# `kill 0` signals the whole process group, so one Ctrl-C takes down all
	@# three children *and* this shell rather than orphaning servers on ports.
	@trap 'trap - INT TERM EXIT; kill 0 2>/dev/null; exit 0' INT TERM EXIT; \
	  ( ./target/debug/api   2>&1 | awk '{ print "\033[35m[api]  \033[0m " $$0; fflush() }' ) & \
	  ( ./target/debug/media 2>&1 | awk '{ print "\033[36m[media]\033[0m " $$0; fflush() }' ) & \
	  ( cd $(WEB_DIR) && npm run dev -- --port $(WEB_PORT) --strictPort 2>&1 \
	      | awk '{ print "\033[32m[web]  \033[0m " $$0; fflush() }' ) & \
	  wait

.PHONY: api
api: ## Run the control plane alone
	cargo run -p api

.PHONY: media
media: ## Run the media plane alone
	cargo run -p media

.PHONY: web
web: ## Run the web client alone
	cd $(WEB_DIR) && npm run dev -- --port $(WEB_PORT) --strictPort

.PHONY: stop
stop: ## Kill whatever is listening on the api, media and web ports
	@for port in $(API_PORT) $(MEDIA_PORT) $(WEB_PORT); do \
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
	for port in $(API_PORT) $(MEDIA_PORT) $(WEB_PORT); do \
	  owner=$$(lsof -nP -iTCP:$$port -sTCP:LISTEN 2>/dev/null | awk 'NR==2 { print $$1 " (pid " $$2 ")" }'); \
	  if [[ -n "$$owner" ]]; then \
	    printf '$(RED)port :%s is taken by %s$(RESET)\n' "$$port" "$$owner"; busy=1; \
	  fi; \
	done; \
	if [[ $$busy -eq 1 ]]; then \
	  printf '$(DIM)run `make stop` to free them$(RESET)\n'; exit 1; \
	fi

# ── setup ───────────────────────────────────────────────────────────────────

.PHONY: setup
setup: env install db ## Create .env, install web deps, create the database
	@printf '\n$(GREEN)ready$(RESET) — run `make dev`\n'

.PHONY: env
env: ## Create .env from .env.example and generate any missing secrets
	@if [[ ! -f .env ]]; then \
	  cp .env.example .env; \
	  printf 'created .env from .env.example\n'; \
	fi
	@# The two secrets must exist and must differ — the API refuses to start
	@# otherwise, because one key forging the other's tokens defeats the split.
	@for name in JWT_SECRET MEDIA_TOKEN_SECRET; do \
	  if ! grep -qE "^$$name=.+" .env; then \
	    value=$$(openssl rand -base64 48 | tr -d '\n'); \
	    if grep -qE "^$$name=" .env; then \
	      sed -i.bak "s|^$$name=.*|$$name=$$value|" .env && rm -f .env.bak; \
	    else \
	      printf '%s=%s\n' "$$name" "$$value" >> .env; \
	    fi; \
	    printf 'generated $(BOLD)%s$(RESET)\n' "$$name"; \
	  fi; \
	done

.PHONY: install
install: ## Install web dependencies
	cd $(WEB_DIR) && npm install

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

# ── quality ─────────────────────────────────────────────────────────────────

.PHONY: check
check: ## Typecheck everything (Rust + TypeScript)
	cargo check --workspace
	cd $(WEB_DIR) && npx tsc -b

.PHONY: test
test: ## Run the Rust test suite
	cargo test --workspace

.PHONY: test-db
test-db: ## Run the tests that need a database
	@$(LOAD_ENV); TEST_DATABASE_URL="$${TEST_DATABASE_URL:-$$DATABASE_URL}" cargo test --workspace

.PHONY: lint
lint: ## Lint both sides
	cargo clippy --workspace --all-targets -- -D warnings
	cd $(WEB_DIR) && npm run lint

.PHONY: fmt
fmt: ## Format Rust code
	cargo fmt --all

.PHONY: build
build: ## Release build of both binaries and the web bundle
	cargo build --workspace --release
	cd $(WEB_DIR) && npm run build

.PHONY: ci
ci: check test lint ## Everything CI would run

# ── diagnostics ─────────────────────────────────────────────────────────────

.PHONY: fingerprints
fingerprints: ## Compare the media-token secret across .env and running processes
	@printf '$(BOLD)MEDIA_TOKEN_SECRET fingerprints$(RESET) $(DIM)(sha256, first 8 hex — same as the servers log at startup)$(RESET)\n\n'
	@$(LOAD_ENV); \
	env_fp=$$(printf '%s' "$${MEDIA_TOKEN_SECRET:-}" | shasum -a 256 | cut -c1-8); \
	printf '  %-28s %s\n' ".env" "$${env_fp:-<unset>}"; \
	for name in api media; do \
	  for pid in $$(pgrep -x $$name 2>/dev/null); do \
	    secret=$$(ps eww $$pid 2>/dev/null | tr ' ' '\n' | grep '^MEDIA_TOKEN_SECRET=' | cut -d= -f2-); \
	    fp=$$(printf '%s' "$$secret" | shasum -a 256 | cut -c1-8); \
	    if [[ "$$fp" == "$$env_fp" ]]; then mark="$(GREEN)matches .env$(RESET)"; \
	    else mark="$(RED)DIFFERS — restart it$(RESET)"; fi; \
	    printf '  %-28s %s  %b\n' "running $$name (pid $$pid)" "$$fp" "$$mark"; \
	  done; \
	done
	@printf '\n$(DIM)A process started before you last edited .env keeps the old secret,\n'
	@printf 'and every voice join then fails with "Your media token is not valid".$(RESET)\n'

.PHONY: doctor
doctor: ## Check tools, secrets, database and ports
	@printf '$(BOLD)tools$(RESET)\n'
	@for tool in cargo node npm psql; do \
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
	if [[ -z "$${JWT_SECRET:-}" || -z "$${MEDIA_TOKEN_SECRET:-}" ]]; then \
	  printf '  $(RED)✗$(RESET) both JWT_SECRET and MEDIA_TOKEN_SECRET must be set\n'; \
	elif [[ "$$JWT_SECRET" == "$$MEDIA_TOKEN_SECRET" ]]; then \
	  printf '  $(RED)✗$(RESET) the two secrets are identical — the API refuses to start\n'; \
	elif [[ $${#MEDIA_TOKEN_SECRET} -lt 32 || $${#JWT_SECRET} -lt 32 ]]; then \
	  printf '  $(RED)✗$(RESET) secrets must be at least 32 characters\n'; \
	else \
	  printf '  $(GREEN)✓$(RESET) secrets set, distinct, long enough\n'; \
	fi
	@printf '\n$(BOLD)database$(RESET)\n'
	@$(LOAD_ENV); \
	if [[ -z "$${DATABASE_URL:-}" ]]; then printf '  $(RED)✗$(RESET) DATABASE_URL not set\n'; \
	elif psql "$$DATABASE_URL" -c 'select 1' >/dev/null 2>&1; then \
	  printf '  $(GREEN)✓$(RESET) reachable  $(DIM)%s$(RESET)\n' "$${DATABASE_URL%%\?*}"; \
	else \
	  printf '  $(RED)✗$(RESET) cannot connect  $(DIM)%s$(RESET)\n' "$${DATABASE_URL%%\?*}"; \
	fi
	@printf '\n$(BOLD)ports$(RESET)\n'
	@for port in $(API_PORT) $(MEDIA_PORT) $(WEB_PORT); do \
	  owner=$$(lsof -nP -iTCP:$$port -sTCP:LISTEN 2>/dev/null | awk 'NR==2 { print $$1 " (pid " $$2 ")" }'); \
	  if [[ -n "$$owner" ]]; then printf '  $(AMBER)●$(RESET) :%-5s in use by %s\n' "$$port" "$$owner"; \
	  else printf '  $(GREEN)○$(RESET) :%-5s free\n' "$$port"; fi; \
	done
	@printf '\n'
	@$(MAKE) --no-print-directory fingerprints

.PHONY: health
health: ## Curl both readiness endpoints
	@printf 'api   : '; curl -fsS -m 3 localhost:$(API_PORT)/ready   || printf '$(RED)unreachable$(RESET)'; printf '\n'
	@printf 'media : '; curl -fsS -m 3 localhost:$(MEDIA_PORT)/ready || printf '$(RED)unreachable$(RESET)'; printf '\n'

# ── docker ──────────────────────────────────────────────────────────────────

.PHONY: docker-up
docker-up: ## Start the full stack in Docker
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
