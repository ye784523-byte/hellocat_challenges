#!/usr/bin/env bash
#
# Install the Hello Cat web terminal on an Ubuntu server.
#
#   sudo bash deploy/install-web.sh
#
# The script creates a dedicated system user, copies the project to
# /opt/hellocat-web, installs the systemd unit and (optionally) an nginx
# reverse proxy.
#
# The terminal is a separate process from the Discord bot. Point DATA_DIR at
# the bot's data directory to share progress between the two:
#
#   DATA_DIR=/opt/hellocat-bot/src/storage/data

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${INSTALL_DIR:-/opt/hellocat-web}"
SERVICE_USER="${SERVICE_USER:-hellocat}"
WEB_PORT="${WEB_PORT:-8080}"
NODE_MAJOR="22"

log() { printf '\033[1;32m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31mxx\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Run this script as root."

log "Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
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
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 22 ] || fail "Node.js 22 or newer is required (found $(node -v))."
log "Node.js $(node -v)"

log "Creating the ${SERVICE_USER} system user"
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/home/${SERVICE_USER}" --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

log "Installing the application into ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
for item in src lib public labs challenges index.js server.js package.json package-lock.json .env.example; do
  [ -e "${PROJECT_DIR}/${item}" ] || continue
  cp -r "${PROJECT_DIR}/${item}" "${INSTALL_DIR}/"
done
mkdir -p "${INSTALL_DIR}/logs" "${INSTALL_DIR}/src/storage/data"

if [ ! -f "${INSTALL_DIR}/.env" ]; then
  log "Creating ${INSTALL_DIR}/.env from the template"
  cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
  chown "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}/.env"
  chmod 600 "${INSTALL_DIR}/.env"
  warn "Edit ${INSTALL_DIR}/.env and set CLIENT_ID, DISCORD_CLIENT_SECRET, FLAG_SECRET and SESSION_SECRET."
fi

log "Installing production dependencies"
cd "${INSTALL_DIR}"
npm ci --omit=dev || npm install --omit=dev

log "Installing the systemd unit"
cp "${PROJECT_DIR}/deploy/hellocat-web.service" /etc/systemd/system/hellocat-web.service
sed -i "s#/opt/hellocat-web#${INSTALL_DIR}#g" /etc/systemd/system/hellocat-web.service
systemctl daemon-reload
systemctl enable hellocat-web

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"

log "Starting the service"
systemctl restart hellocat-web
sleep 2
systemctl --no-pager --lines=20 status hellocat-web || true

cat <<EOF

$(log "Installation complete")

  The terminal listens on http://127.0.0.1:${WEB_PORT}
  Set WEB_PORT=${WEB_PORT} and WEB_BASE_URL in ${INSTALL_DIR}/.env if you changed it.

  Next steps:
    1. Edit ${INSTALL_DIR}/.env  (CLIENT_ID, DISCORD_CLIENT_SECRET, FLAG_SECRET, SESSION_SECRET)
    2. Register the OAuth redirect URI in the Discord developer portal:
         ${WEB_BASE_URL:-https://terminal.example.com}/auth/callback
    3. Put nginx in front of it:
         cp ${PROJECT_DIR}/deploy/nginx/hellocat-web.conf /etc/nginx/sites-available/hellocat-web
    4. Follow the logs:  journalctl -u hellocat-web -f

EOF
