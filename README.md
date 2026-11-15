# Hello Cat — Web Terminal

[![Node](https://img.shields.io/badge/node-%3E%3D22-5FA04E)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/site-helloc.at-0f0f0f)](https://helloc.at)
[![Discord](https://img.shields.io/badge/discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/hellocat)

**The browser-based CTF lab of the Hello Cat project.**

A terminal that mimics a Kali Linux workstation, used to solve the Hello Cat
challenges. It shares the challenge catalogue, the flag store and the operator
identity with the Discord bot, so progress earned in either place is the same
progress.

The same process also serves the landing page — the official site at
`https://helloc.at` — in front of the application.

```
┌──────────────────────────────────────────────────────────────┐
│  HELLO CAT  ·  CHALLENGES  │  terminal@kali-lab:~$ ls -la    │
│  HC-005 Overpermissioned   │  drwxr-xr-x  cleanup.conf       │
│  HC-010 White Rabbit Vigenere  drwxrwxrwx  rotate.sh        │
├────────────────────────────┴─────────────────────────────────┤
│  [ HINT ]  [ SUBMIT FLAG ]                                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Table of contents

- [The two repositories](#the-two-repositories)
- [How the terminal connects to the Discord bot](#how-the-terminal-connects-to-the-discord-bot)
- [Quick start](#quick-start)
- [Routes](#routes)
- [The landing page](#the-landing-page)
- [Design](#design)
- [Configuration](#configuration)
- [Discord application setup](#discord-application-setup)
- [Deployment](#deployment)
- [Using the terminal](#using-the-terminal)
- [API](#api)
- [Adding a lab](#adding-a-lab)
- [Testing](#testing)
- [Security notes](#security-notes)
- [Project structure](#project-structure)
- [License](#license)

---

## The two repositories

| Repository | What it is |
| --- | --- |
| **[hellocat-bot](https://github.com/ye784523-byte/hellocat-bot)** | The Discord bot: the channel assistant, the command surface, the progression and economy systems, the moderation and admin tooling, and the challenge catalogue. |
| **[hellocat_challenges](https://github.com/ye784523-byte/hellocat_challenges)** *(this repo)* | The web terminal: the browser-based Kali-style lab where operators solve the challenges, plus the public landing page. |

Both repositories ship the same challenge catalogue (`challenges/`, 17
educational targets) and the same service layer (`src/storage`, `src/services`),
so a flag solved in the browser is a flag solved in the Discord bot.

---

## How the terminal connects to the Discord bot

The two halves are not wired together over the network. They are wired together
through **shared state** and a **shared identity**.

### 1. One data store, two processes

Both halves read and write the same JSON files in `DATA_DIR` (default
`src/storage/data`):

```text
src/storage/data/
├── users.json        # XP, ranks, streaks, CATCOINS
├── challenges.json   # the catalogue and its published state
├── submissions.json  # attempts and captures
├── achievements.json
├── economy.json
├── settings.json     # announcement watermarks and runtime settings
├── moderation.json
└── audit.json
```

Writes are atomic (temp file → `fsync` → rename) **and** serialised with a
lock file (`src/utils/fileLock.js`), so the bot and the terminal can run side
by side without losing each other's updates.

Point the terminal at the bot's directory to share progress:

```dotenv
DATA_DIR=/opt/hellocat-bot/src/storage/data
```

If you would rather isolate them, give each side its own `DATA_DIR` — progress
then has to be synced separately.

### 2. The same code path

This repository vendors the bot's `src/` tree and calls the very same services
— `challengeService`, `playerService`, `economyService`,
`achievementService` — against that store. A capture in the browser is not a
copy of a capture in Discord; it is the same operation.

### 3. The same identity

Operators sign in with **Discord OAuth2** and the Discord user id is the
operator id. That user id is the key used by `users.json`, so:

- XP, ranks, streaks, achievements and CATCOINS are shared.
- A solve in the terminal shows up in the bot's `/profile`, `/rank` and
  `/leaderboard`.
- `WEB_CLIENT_ID` defaults to `CLIENT_ID`, so one Discord application usually
  serves both halves. Set it explicitly when the terminal uses a separate
  application.

### 4. The same flag hashes

Flags are stored as `HMAC-SHA256(FLAG_SECRET, normalised_flag)` in both
halves. **Both processes must use the same `FLAG_SECRET`**, otherwise the
terminal computes a different hash than the bot and no submission ever
verifies.

### 5. The bot announces what the terminal solves

The bot's announcement scheduler polls `submissions.json` and celebrates
captures that happened in the browser, keeping a watermark in `settings.json`.
The bot is the narrator; the terminal is the battlefield.

### 6. Deep links in both directions

```text
bot  ──▶  <WEB_PUBLIC_URL>/terminal?challenge=HC-001      (announcements, hints)
bot  ──▶  https://discord.gg/<invite>                      (the terminal's call to action)
bot  ◀──  captures, XP and coins written into the shared store
```

### Running the two halves together

```bash
# terminal (this repository, own process)
npm install && npm start          # http://localhost:8080

# bot (https://github.com/ye784523-byte/hellocat-bot)
npm install && npm start          # connected to the same DATA_DIR
```

Both need the same `FLAG_SECRET`.

---

## Quick start

```bash
# 1. Configure
cp .env.example .env
$EDITOR .env          # set CLIENT_ID, DISCORD_CLIENT_SECRET, FLAG_SECRET, SESSION_SECRET

# 2. Install
npm install

# 3. Start
npm start             # http://localhost:8080
```

Open `http://localhost:8080` for the landing page, or
`http://localhost:8080/terminal` to sign in with Discord and be dropped into
`analyst@kali-lab:~$`.

The challenge catalogue is imported into the store on every start, so a fresh
checkout is playable immediately. The import is idempotent: an updated
definition replaces the stored one.

| Script | What it does |
| --- | --- |
| `npm start` | Run the terminal. |
| `npm run web` | Alias of `npm start`. |
| `npm test` | Run the test suite. |
| `npm run lint` | Syntax-check every JavaScript file. |

---

## Routes

| Route | What it serves |
| --- | --- |
| `GET /` | the landing page — the official site, public |
| `GET /terminal` | the terminal application, behind the Discord sign-in |
| `GET /index.html` | redirects to `/terminal` (old links) |
| `GET /api/public/stats` | the range counters shown on the landing page |
| `GET /auth/login` | the Discord OAuth2 handshake |
| `GET /auth/callback` | finishes the handshake and opens `/terminal` |
| `GET /healthz` | liveness probe |

---

## The landing page

`public/landing.html` is the front door of the project: a Matrix-style page
that explains what Hello Cat is, why it exists and how to join.

- **Public.** No session, no redirect — the visitor reads the site before they
  decide to sign in.
- **Discord only.** The invite is the primary call to action and the page
  states in plain words that Discord is the only supported platform: there is no
  other client to download and no account to create elsewhere.
- **Official site.** The address the site is served from is written on the page
  and in the canonical link. `https://helloc.at` is the official address of the
  project and appears in the copyright, because lookalike domains are the usual
  way people get phished.
- **Live counters.** `GET /api/public/stats` returns the number of published
  targets per category and per difficulty. It carries counts only — never a
  title, a description or a flag.

The page is a template. The server replaces four placeholders before it is
sent:

| Placeholder | Value |
| --- | --- |
| `{{SITE_URL}}` | the address the site is served from (`WEB_BASE_URL`) — canonical link, og:url |
| `{{OFFICIAL_SITE_URL}}` | `OFFICIAL_SITE_URL` (default `https://helloc.at`) — the copyright |
| `{{DISCORD_INVITE_URL}}` | `DISCORD_INVITE_URL` (default `https://discord.gg/<GUILD_ID>`) |
| `{{TERMINAL_URL}}` | `/terminal` |

The three files are:

| File | Responsibility |
| --- | --- |
| `public/landing.html` | the markup |
| `public/landing.css` | the theme, shared with the terminal palette |
| `public/landing.js` | the rain, the decode effect, the counters, the mobile menu |

Everything decorative respects `prefers-reduced-motion`: the rain, the boot
overlay and the reveals are replaced by the final state.

### The application

The terminal application itself is unchanged — it lives at `/terminal` now, so
the landing page can own the root of the domain. Deep links keep working:
`/terminal?challenge=HC-001` loads a target directly.

---

## Design

The terminal is **fully simulated**. Every command runs against an in-memory
filesystem implemented in JavaScript — no `child_process`, no shell, no network
calls to arbitrary hosts. This makes it safe to expose to a class of students
and it means a stray `rm -rf /` can only destroy the session's own sandbox.

| Layer | File | Responsibility |
| --- | --- | --- |
| HTTP server | `server.js` | routing, auth gate, JSON API, SSE stream |
| Entry point | `index.js` | configuration, startup probe, graceful shutdown |
| Session | `lib/session.js` | per-operator shell, challenge state, flag submission |
| Shell | `lib/shell.js` | tokenizer, pipelines, redirection, globbing, history |
| Commands | `lib/commands/*.js` | ~90 commands across 8 groups |
| Filesystem | `lib/vfs.js` | nodes, permissions, symlinks, path resolution |
| Image | `lib/basefs.js` | the Kali-like baseline tree |
| Labs | `labs/*.json` | one environment per challenge |
| Interpreter | `lib/python.js` | a compact Python subset |
| Auth | `lib/auth.js` | Discord OAuth2 + signed session cookies |
| Storage | `src/storage/` | the JSON store shared with the Discord bot |
| Services | `src/services/` | the bot's service layer, called unchanged |

### Why a hand-written Python?

Three challenges (XOR Gate, White Rabbit Vigenère, Nested Signal) are
scripting exercises. Without an interpreter the operator has to solve them on
paper, which teaches nothing about the terminal. `lib/python.js` implements
variables, control flow, functions, lists, dicts, string methods, f-strings and
`base64` / `binascii` / `hashlib` / `math` modules — enough to brute-force a
Vigenère key, but small enough to audit.

---

## Configuration

Copy `.env.example` to `.env`. The full annotated template ships with the
repository.

| Variable | Required | Purpose |
| --- | --- | --- |
| `CLIENT_ID` | Yes | Discord application id. |
| `DISCORD_CLIENT_SECRET` | Yes | OAuth2 client secret of that application. Never the bot token. |
| `FLAG_SECRET` | Yes | HMAC key for the flags, at least 16 characters. **Must match the bot.** |
| `SESSION_SECRET` | No | Signs the session cookie, at least 16 characters. Defaults to `FLAG_SECRET`. |
| `WEB_CLIENT_ID` | No | OAuth2 client id when the terminal uses a separate application. Defaults to `CLIENT_ID`. |
| `DATA_DIR` | No | Shared JSON data directory. Default `src/storage/data`. |
| `LOG_DIR` | No | Log directory. Default `logs`. |
| `WEB_PORT` | No | Port to bind. Falls back to `PORT`, then `8000`. |
| `WEB_HOST` | No | Bind address. Default `0.0.0.0`. |
| `WEB_BASE_URL` | Prod | Public address of the site. The root serves the landing page, `/terminal` the application. |
| `WEB_REDIRECT_URI` | Prod | OAuth2 redirect URI. Defaults to `WEB_BASE_URL + /auth/callback`, or the request host when unset. Must match the developer portal byte for byte. |
| `OFFICIAL_SITE_URL` | No | Official website written on the landing page. Default `https://helloc.at`. |
| `DISCORD_INVITE_URL` | No | Invite to the Discord server, the primary call to action. Defaults to `https://discord.gg/<GUILD_ID>`. |
| `WEB_REQUIRE_GUILD` | No | Require Discord server membership before granting access. |
| `WEB_COOKIE_SECURE` | No | `auto` (default), `true` or `false`. `auto` marks the cookie Secure for HTTPS requests. |
| `WEB_TRUST_PROXY` | No | Honour `X-Forwarded-Proto` from a loopback proxy. Default `true`. |
| `WEB_COOKIE_DOMAIN` | No | Cookie domain. Empty (default) keeps the cookie host-only. |
| `WEB_SESSION_TTL` | No | Session lifetime in seconds. Default `43200` (12 hours). |
| `GUILD_ID` | No | Guild checked when `WEB_REQUIRE_GUILD=true`. |
| `DISCORD_TOKEN` | No | Only needed when the terminal posts on its own. The terminal never connects to the gateway. |

**Never commit `.env`.** It is already ignored.

---

## Discord application setup

1. Create an application at <https://discord.com/developers/applications>.
2. Under **OAuth2 → Redirects**, add `http://localhost:8080/auth/callback`
   (and your production URL).
3. Copy the client secret into `DISCORD_CLIENT_SECRET`.
4. The bot's `CLIENT_ID` is reused — one application serves both the bot and
   the terminal. Set `WEB_CLIENT_ID` when the terminal uses its own
   application.

---

## Deployment

### Ubuntu server

```bash
sudo bash deploy/install-web.sh
```

The script installs Node.js 22+, creates a locked-down `hellocat` system user,
copies the project to `/opt/hellocat-web`, installs
`deploy/hellocat-web.service` and starts the service.

Then put nginx in front of it:

```bash
sudo cp deploy/nginx/hellocat-web.conf /etc/nginx/sites-available/hellocat-web
sudo ln -s /etc/nginx/sites-available/hellocat-web /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Set these in `/opt/hellocat-web/.env` before starting:

```ini
WEB_PORT=8080
WEB_BASE_URL=https://terminal.example.com
WEB_COOKIE_SECURE=true
OFFICIAL_SITE_URL=https://helloc.at
DISCORD_INVITE_URL=https://discord.gg/your-invite
DATA_DIR=/opt/hellocat-bot/src/storage/data
```

The nginx configuration disables proxy buffering so the terminal's
server-sent event stream arrives immediately.

### systemd

```bash
systemctl status hellocat-web
journalctl -u hellocat-web -f
sudo systemctl restart hellocat-web
```

The unit runs as a non-root user with `ProtectSystem=strict` and an explicit
`ReadWritePaths` list. The terminal does not need write access to anything
except the shared data folder.

### PaaS (Railway, Render, Fly)

The application is a plain Node.js service:

| Setting | Value |
| --- | --- |
| Build command | `npm ci` |
| Start command | `npm start` |
| Port | injected as `PORT`, used when `WEB_PORT` is unset |
| Health check | `GET /healthz` |

Set `WEB_BASE_URL` to the public address of the deployment and register
`<WEB_BASE_URL>/auth/callback` as an OAuth2 redirect in the Discord developer
portal. `DATA_DIR` must point at a **persistent volume** — the progress of the
operators lives there.

---

## Using the terminal

| Command | What it does |
| --- | --- |
| `challenges` | list the active challenges (🔒 marks a sealed entry) |
| `start HC-016` | load a challenge environment |
| `submit HC{...}` | submit a flag for the loaded challenge |
| `hint` | reveal the next hint (hints with a cost deduct CATCOINS) |
| `objective` | restate the current objective |
| `reset` | rebuild the environment from scratch |
| `help` | the full command list |

Flags can also be submitted from the **SUBMIT FLAG** button above the terminal.

### Sealed labs

A challenge can require other challenges to be captured first
(`prerequisites` in the challenge definition). While the gate is closed the
terminal refuses to load the environment and refuses the flag submission, and
the sidebar marks the entry with 🔒. The gate is evaluated per operator: once
the prerequisite is captured, the lab opens for that operator only.

### Command highlights

```bash
# Reconnaissance
nmap -sV -p- 10.20.0.44
gobuster dir -u http://vault.rabbit.lab -w /usr/share/wordlists/dirb/common.txt
nikto -h http://vault.rabbit.lab

# Analysis
cat /var/log/lab/arp.log | grep -i 'is-at'
strings artifact.bin | grep -i rabbit
xxd artifact.bin | head
file suspicious.bin

# Encoding and crypto
echo d2VsY29tZV9ob21l | base64 -d
cat notes/intercept.txt | tr 'a-z' 'n-za-m'      # ROT13
sha256sum artifact.bin
openssl dgst -md5 < file

# Text processing
cat /etc/passwd | cut -d: -f1,7 | grep -v nologin
awk -F: '{print $1}' /etc/passwd
sed 's/analyst/operator/g' notes/todo.txt

# Scripting
python3 gate.py
python3 -c "print(4^6^8)"
```

Pipelines (`|`), redirection (`>`, `>>`), chaining (`&&`, `||`, `;`), quoting,
environment variables (`$HOME`), globs (`*.log`), aliases and command history
all behave the way they do in bash.

---

## API

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/` | the landing page (public) |
| `GET` | `/terminal` | the terminal application (requires a session) |
| `GET` | `/auth/login` | start the Discord OAuth2 handshake |
| `GET` | `/auth/callback` | finish the handshake, set the session cookie |
| `GET` | `/auth/logout` | clear the session cookie |
| `GET` | `/api/public/stats` | range counters for the landing page (public) |
| `GET` | `/api/session` | profile, XP, progress and the command catalogue |
| `GET` | `/api/challenges` | the challenge catalogue with solve state |
| `POST` | `/api/challenges/start` | load a challenge environment |
| `POST` | `/api/flag` | submit a flag |
| `POST` | `/api/hint` | reveal a hint |
| `POST` | `/api/terminal/exec` | run a command, returns stdout/stderr/prompt |
| `GET` | `/api/terminal/events` | server-sent events (solved notifications) |
| `GET` | `/healthz` | liveness probe |

Every `/api/*` route requires a valid session cookie, except
`/api/public/stats`.

---

## Adding a lab

Create `labs/HC-0XX.json` next to the existing ones:

```json
{
  "id": "HC-017",
  "title": "Something New",
  "host": "target.rabbit.lab",
  "user": "analyst",
  "cwd": "/home/analyst",
  "banner": "  What the operator sees when the lab loads.",
  "hosts": {
    "target.rabbit.lab": {
      "ip": "10.20.0.99",
      "server": "nginx/1.24.0",
      "ports": { "80/tcp": { "service": "http", "version": "nginx 1.24.0" } }
    }
  },
  "dns": { "target.rabbit.lab": "10.20.0.99" },
  "arp": [["10.20.0.99", "00:11:22:33:44:99", "C", "eth0"]],
  "webroot": { "/robots.txt": "User-agent: *\nDisallow: /secret\n" },
  "files": {
    "/home/analyst/notes/lead.txt": {
      "content": "Start here.\n",
      "owner": "analyst", "group": "analysts", "uid": 1000, "gid": 1000,
      "mode": 420
    }
  }
}
```

Then add the matching challenge to `challenges/<difficulty>/`. The catalogue is
imported into the store on every start, so the lab is available the next time
the service starts. The import is idempotent.

`files` is mounted as root; specify `owner`, `group`, `uid`, `gid` and `mode`
to control who can read what. Modes matter — several challenges are about
permissions, and `ls -l` renders them faithfully.

---

## Testing

```bash
npm test
npm run lint
```

The suite covers the shell (tokenizer, pipelines, redirection, globbing), the
in-memory filesystem, the lab environments, the Python subset, the signed
session tokens and cookies, the OAuth2 gate, the landing page, the fit addon
and the command catalogue.

`tests/web-terminal.test.js` includes a table that drives every challenge with
the commands a solver would realistically use and asserts the answer is
reachable — so a broken lab fails the build rather than puzzling a student.

Tests use temporary directories and never require a Discord token or network
access.

---

## Security notes

- No host command execution, ever. The command set is a fixed registry.
- No outbound network calls to arbitrary hosts; `curl` and `nmap` only see the
  lab's own inventory.
- Sessions live in memory and expire after two hours of inactivity.
- The session cookie is `HttpOnly`, `SameSite=Lax` and signed with HMAC-SHA256.
- Discord bot tokens are never sent to the browser; only the `identify` scope
  is requested.
- Every flag is verified with the same HMAC scheme the Discord bot uses, so
  plaintext flags are never stored in the shared data files.
- The bundled challenges are educational examples. Rotate their flags before
  using them in a competitive event.

---

## Project structure

```text
hellocat_challenges/
├── index.js                 # entry point: config, startup probe, shutdown
├── server.js                # HTTP server: routing, auth gate, JSON API, SSE
├── lib/                     # shell, vfs, basefs, labs, python, auth, session, proxy
│   └── commands/            # ~90 commands across 8 groups
├── public/                  # the terminal application and the landing page
├── labs/                    # one JSON environment per challenge
├── challenges/              # the challenge catalogue (easy/ medium/ hard/ expert/)
├── src/                     # the bot's storage, services and utils, vendored
├── tests/                   # node:test suites
├── deploy/                  # systemd unit, install script, nginx template
├── .env.example
├── package.json
└── README.md
```

---

## License

MIT.

Every challenge is a fictitious educational scenario for authorized lab
environments. CATCOINS are fictional and have no monetary value.
