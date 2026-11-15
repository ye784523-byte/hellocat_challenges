#!/usr/bin/env bash
#
# Hello Cat web terminal — installer.
#
#   ./install.sh                 install for local use
#   sudo ./install.sh --server   install as a service on this machine
#   sudo ./install.sh --uninstall remove the service (the data is kept)
#   ./install.sh --help          every option
#
# From a fresh machine, without a checkout:
#
#   curl -fsSL https://raw.githubusercontent.com/ye784523-byte/hellocat_challenges/main/install.sh | bash
#
# The installer is idempotent: it never overwrites an existing .env, never
# touches the data directory and never reinstalls what is already there.

set -euo pipefail

REPO_URL="https://github.com/ye784523-byte/hellocat_challenges.git"
DEFAULT_DIR="hellocat_challenges"
SERVER_DIR="/opt/hellocat-web"
NODE_MAJOR="22"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || pwd)"

# ------------------------------------------------------------------ options

MODE="local"
INSTALL_DIR=""
SERVICE_USER="hellocat"
WEB_PORT="8080"
WEB_BASE_URL=""
DATA_DIR=""
USE_NGINX="auto"
ASSUME_YES="false"

# ------------------------------------------------------------------ output

if [ -t 1 ]; then
  C_OK=$'\033[1;32m'; C_WARN=$'\033[1;33m'; C_ERR=$'\033[1;31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_OFF=""
fi

log()  { printf '%s==>%s %s\n' "$C_OK" "$C_OFF" "$1"; }
warn() { printf '%s!!%s %s\n' "$C_WARN" "$C_OFF" "$1"; }
fail() { printf '%sxx%s %s\n' "$C_ERR" "$C_OFF" "$1" >&2; exit 1; }
step() { printf '%s  ·%s %s\n' "$C_DIM" "$C_OFF" "$1"; }
hint() { printf '%s  →%s %s\n' "$C_DIM" "$C_OFF" "$1"; }

usage() {
  cat <<'EOF'
Hello Cat web terminal - installer

Usage:
  install.sh [options]

Modes:
  (default)              install the terminal for local use
  --server               install it as a systemd service on this machine
  --uninstall            remove the systemd service (the data is kept)

Options:
  --dir <path>           where the application lives
                          (default: the current checkout, or ./hellocat_challenges)
  --user <name>          system user for the service (default: hellocat)
  --port <number>        port to listen on (default: 8080)
  --url <url>            public address of the site, e.g. https://terminal.example.com
  --data-dir <path>      shared JSON store, e.g. /opt/hellocat-bot/src/storage/data
  --no-nginx             do not install the nginx reverse proxy
  --nginx                install the nginx reverse proxy (default on servers)
  --yes                  do not ask any question
  -h, --help             this help

Examples:
  ./install.sh --url https://terminal.example.com
  sudo ./install.sh --server --url https://terminal.example.com \
    --data-dir /opt/hellocat-bot/src/storage/data
EOF
}

# ------------------------------------------------------------------ parsing

while [ $# -gt 0 ]; do
  case "$1" in
    --server) MODE="server"; shift ;;
    --local) MODE="local"; shift ;;
    --uninstall) MODE="uninstall"; shift ;;
    --dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --user) SERVICE_USER="${2:-}"; shift 2 ;;
    --port) WEB_PORT="${2:-}"; shift 2 ;;
    --url) WEB_BASE_URL="${2:-}"; shift 2 ;;
    --data-dir) DATA_DIR="${2:-}"; shift 2 ;;
    --no-nginx) USE_NGINX="no"; shift ;;
    --nginx) USE_NGINX="yes"; shift ;;
    --yes|-y) ASSUME_YES="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1 (try --help)" ;;
  esac
done

# The default target is the checkout the script lives in, when there is one.
default_dir() {
  if [ -f "${SCRIPT_DIR}/package.json" ] && [ -d "${SCRIPT_DIR}/lib" ]; then
    printf '%s' "$SCRIPT_DIR"
  else
    printf '%s' "$DEFAULT_DIR"
  fi
}

[ -n "$INSTALL_DIR" ] || { [ "$MODE" = "server" ] && INSTALL_DIR="$SERVER_DIR" || INSTALL_DIR="$(default_dir)"; }

# ----------------------------------------------------------------- helpers

is_root() { [ "$(id -u)" -eq 0 ]; }
have() { command -v "$1" >/dev/null 2>&1; }

confirm() {
  if [ "$ASSUME_YES" = "true" ]; then return 0; fi
  if [ ! -t 0 ]; then return 0; fi
  printf '%s  ?%s %s [y/N] ' "$C_DIM" "$C_OFF" "$1"
  read -r answer
  case "$answer" in
    [yY]|[yY][eE][sS]) return 0 ;;
    *) return 1 ;;
  esac
}

node_major() {
  have node || { echo 0; return; }
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

random_secret() {
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
}

# --------------------------------------------------------------- node setup

install_node_ubuntu() {
  is_root || fail "Node.js ${NODE_MAJOR}+ is required. Install it with: sudo apt install -y nodejs"
  log "Installing Node.js ${NODE_MAJOR} from NodeSource"
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y "nodejs=${NODE_MAJOR}.x"
}

ensure_node() {
  if [ "$(node_major)" -ge "$NODE_MAJOR" ] 2>/dev/null; then
    log "Node.js $(node -v)"
    return 0
  fi

  warn "Node.js ${NODE_MAJOR} or newer is required (found: $(have node && node -v || echo none))"

  if have apt-get; then
    install_node_ubuntu
  elif have pkg; then
    # Termux on Android.
    log "Installing Node.js with pkg"
    pkg update -y && pkg install -y nodejs
  elif have brew; then
    log "Installing Node.js with Homebrew"
    brew install node
  else
    fail "Install Node.js ${NODE_MAJOR}+ and run this script again."
  fi

  [ "$(node_major)" -ge "$NODE_MAJOR" ] 2>/dev/null || fail "Node.js ${NODE_MAJOR}+ is still missing."
  log "Node.js $(node -v)"
}

# -------------------------------------------------------------- the source

# Returns the directory that holds the application files.
resolve_source() {
  if [ -f "${SCRIPT_DIR}/package.json" ] && [ -d "${SCRIPT_DIR}/lib" ]; then
    printf '%s' "$SCRIPT_DIR"
    return 0
  fi

  have git || fail "git is required to fetch the application."
  log "Cloning ${REPO_URL}"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  printf '%s' "$INSTALL_DIR"
}

# --------------------------------------------------------------- the .env

set_env_value() {
  local file="$1" key="$2" value="$3"
  # The value can contain slashes, colons and ampersands, so the separator is
  # a pipe and the ampersands are escaped for the replacement.
  local escaped
  escaped="$(printf '%s' "$value" | sed -e 's/[&|]/\\&/g')"

  if grep -qE "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$escaped" >> "$file"
  fi
}

write_env() {
  local env_file="$1"

  if [ -f "$env_file" ]; then
    step ".env already exists, it is left untouched"
    return 0
  fi

  [ -f "${INSTALL_DIR}/.env.example" ] || fail ".env.example is missing from ${INSTALL_DIR}"

  cp "${INSTALL_DIR}/.env.example" "$env_file"
  chmod 600 "$env_file"

  # The secrets are generated here, so a fresh install can verify a flag right
  # away. They can be changed later, but then the flags have to be re-hashed.
  set_env_value "$env_file" "FLAG_SECRET" "$(random_secret)"
  set_env_value "$env_file" "SESSION_SECRET" "$(random_secret)"
  set_env_value "$env_file" "WEB_PORT" "$WEB_PORT"

  [ -n "$WEB_BASE_URL" ] && set_env_value "$env_file" "WEB_BASE_URL" "$WEB_BASE_URL"
  [ -n "$DATA_DIR" ] && set_env_value "$env_file" "DATA_DIR" "$DATA_DIR"

  log "Created ${env_file} with generated secrets"
}

# ------------------------------------------------------------------- nginx

install_nginx() {
  have nginx || { warn "nginx is not installed, skipping the reverse proxy"; return 0; }
  [ -d /etc/nginx/sites-available ] || { warn "no nginx site directory, skipping"; return 0; }

  log "Installing the nginx reverse proxy"
  cp "${INSTALL_DIR}/deploy/nginx/hellocat-web.conf" /etc/nginx/sites-available/hellocat-web
  ln -sf /etc/nginx/sites-available/hellocat-web /etc/nginx/sites-enabled/hellocat-web

  if nginx -t; then
    systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
    log "nginx is in front of the terminal"
    hint "edit /etc/nginx/sites-available/hellocat-web to set your hostname and certificate"
  else
    warn "the nginx configuration is invalid, it was not activated"
  fi
}

# ------------------------------------------------------------- local mode

install_local() {
  ensure_node
  local source
  source="$(resolve_source)"
  INSTALL_DIR="$source"

  log "Installing the dependencies in ${INSTALL_DIR}"
  cd "$INSTALL_DIR"
  if [ -f package-lock.json ]; then
    npm ci --omit=dev || npm install --omit=dev
  else
    npm install --omit=dev
  fi

  write_env "${INSTALL_DIR}/.env"
  mkdir -p "${INSTALL_DIR}/logs" "${INSTALL_DIR}/src/storage/data"

  print_next_steps "local"
}

# ------------------------------------------------------------ server mode

install_server() {
  is_root || fail "The server install needs root. Run it with sudo."
  ensure_node

  local source
  source="$(resolve_source)"

  if [ "$source" != "$INSTALL_DIR" ]; then
    log "Installing the application into ${INSTALL_DIR}"
    mkdir -p "$INSTALL_DIR"
    for item in src lib public labs challenges index.js server.js package.json package-lock.json .env.example deploy; do
      [ -e "${source}/${item}" ] || continue
      cp -r "${source}/${item}" "$INSTALL_DIR/"
    done
  else
    log "Using the existing checkout in ${INSTALL_DIR}"
  fi

  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    log "Creating the ${SERVICE_USER} system user"
    useradd --system --create-home --home-dir "/home/${SERVICE_USER}" --shell /usr/sbin/nologin "$SERVICE_USER"
  fi

  mkdir -p "${INSTALL_DIR}/logs" "${INSTALL_DIR}/src/storage/data"

  write_env "${INSTALL_DIR}/.env"

  log "Installing the production dependencies"
  cd "$INSTALL_DIR"
  npm ci --omit=dev || npm install --omit=dev

  if have systemctl; then
    log "Installing the systemd unit"
    cp "${INSTALL_DIR}/deploy/hellocat-web.service" /etc/systemd/system/hellocat-web.service
    sed -i "s#/opt/hellocat-web#${INSTALL_DIR}#g" /etc/systemd/system/hellocat-web.service
    systemctl daemon-reload
    systemctl enable hellocat-web
    systemctl restart hellocat-web
    sleep 2
    systemctl --no-pager --lines=10 status hellocat-web || true
  else
    warn "systemd is not available, the service was not installed"
  fi

  chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR"

  if [ "$USE_NGINX" != "no" ]; then
    if [ "$USE_NGINX" = "yes" ] || confirm "Install the nginx reverse proxy?"; then
      install_nginx
    fi
  fi

  print_next_steps "server"
}

# -------------------------------------------------------------- uninstall

uninstall_service() {
  is_root || fail "The uninstall needs root. Run it with sudo."

  if have systemctl; then
    log "Stopping and removing the systemd unit"
    systemctl disable --now hellocat-web 2>/dev/null || true
    rm -f /etc/systemd/system/hellocat-web.service
    systemctl daemon-reload
  fi

  if [ "$USE_NGINX" != "no" ] && [ -f /etc/nginx/sites-enabled/hellocat-web ]; then
    log "Removing the nginx site"
    rm -f /etc/nginx/sites-enabled/hellocat-web /etc/nginx/sites-available/hellocat-web
    nginx -t && systemctl reload nginx 2>/dev/null || true
  fi

  step "the application and its data are still in ${INSTALL_DIR}"
  hint "remove them with: rm -rf ${INSTALL_DIR}"
}

# ------------------------------------------------------------ next steps

print_next_steps() {
  local where="$1"
  local url="${WEB_BASE_URL:-http://localhost:${WEB_PORT}}"

  printf '\n%sInstallation complete.%s\n\n' "$C_OK" "$C_OFF"

  if [ "$where" = "local" ]; then
    step "start the terminal:"
    hint "cd ${INSTALL_DIR} && npm start"
  else
    step "the service is running:"
    hint "systemctl status hellocat-web"
    hint "journalctl -u hellocat-web -f"
  fi

  printf '\n%s  1%s Fill in the Discord credentials in %s\n' "$C_DIM" "$C_OFF" "${INSTALL_DIR}/.env"
  hint "CLIENT_ID and DISCORD_CLIENT_SECRET, from the Discord developer portal"
  printf '\n%s  2%s Register the OAuth redirect in the Discord developer portal\n' "$C_DIM" "$C_OFF"
  hint "${url}/auth/callback"
  printf '\n%s  3%s Share the store with the Discord bot\n' "$C_DIM" "$C_OFF"
  hint "DATA_DIR in ${INSTALL_DIR}/.env — the bot must use the same FLAG_SECRET"
  printf '\n%s  4%s Open the site\n' "$C_DIM" "$C_OFF"
  hint "${url}"
  printf '\n'
}

# ------------------------------------------------------------------- main

case "$MODE" in
  local) install_local ;;
  server) install_server ;;
  uninstall) uninstall_service ;;
esac
