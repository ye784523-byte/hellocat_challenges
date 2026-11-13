# Hello Cat — Web Terminal

A browser-based terminal that mimics a Kali Linux workstation, used to solve the
Hello Cat challenges. It shares the challenge catalogue and the flag store with
the Discord bot, so progress earned in either place is the same progress.

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

## The landing page

`web/public/landing.html` is the front door of the project: a Matrix-style page
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
| `web/public/landing.html` | the markup |
| `web/public/landing.css` | the theme, shared with the terminal palette |
| `web/public/landing.js` | the rain, the decode effect, the counters, the mobile menu |

Everything decorative respects `prefers-reduced-motion`: the rain, the boot
overlay and the reveals are replaced by the final state.

### The application

The terminal application itself is unchanged — it lives at `/terminal` now, so
the landing page can own the root of the domain. Deep links keep working:
`/terminal?challenge=HC-001` loads a target directly.


## Design

The terminal is **fully simulated**. Every command runs against an in-memory
filesystem implemented in JavaScript — no `child_process`, no shell, no network
calls to arbitrary hosts. This makes it safe to expose to a class of students
and it means a stray `rm -rf /` can only destroy the session's own sandbox.

| Layer | File | Responsibility |
| --- | --- | --- |
| HTTP server | `web/server.js` | routing, auth gate, JSON API, SSE stream |
| Session | `web/lib/session.js` | per-operator shell, challenge state, flag submission |
| Shell | `web/lib/shell.js` | tokenizer, pipelines, redirection, globbing, history |
| Commands | `web/lib/commands/*.js` | ~90 commands across 8 groups |
| Filesystem | `web/lib/vfs.js` | nodes, permissions, symlinks, path resolution |
| Image | `web/lib/basefs.js` | the Kali-like baseline tree |
| Labs | `web/labs/*.json` | one environment per challenge |
| Interpreter | `web/lib/python.js` | a compact Python subset |
| Auth | `web/lib/auth.js` | Discord OAuth2 + signed session cookies |

### Why a hand-written Python?

Three challenges (XOR Gate, White Rabbit Vigenère, Nested Signal) are
scripting exercises. Without an interpreter the operator has to solve them on
paper, which teaches nothing about the terminal. `web/lib/python.js` implements
variables, control flow, functions, lists, dicts, string methods, f-strings and
`base64` / `binascii` / `hashlib` / `math` modules — enough to brute-force a
Vigenère key, but small enough to audit.

## Running locally

```bash
# 1. Configure
cp .env.example .env
$EDITOR .env          # set DISCORD_CLIENT_SECRET, SESSION_SECRET, FLAG_SECRET

# 2. Start
npm run web           # http://localhost:8080
```

Open `http://localhost:8080` for the landing page, or
`http://localhost:8080/terminal` to sign in with Discord and be dropped into
`analyst@kali-lab:~$`.

### Discord application setup

1. Create an application at <https://discord.com/developers/applications>.
2. Under **OAuth2 → Redirects**, add `http://localhost:8080/auth/callback`
   (and your production URL).
3. Copy the client secret into `DISCORD_CLIENT_SECRET`.
4. The bot's `CLIENT_ID` is reused — one application serves both the bot and
   the web terminal.

## Production on Ubuntu

```bash
sudo bash deploy/install-web.sh
```

The script installs Node.js 22+, creates a locked-down `hellocat` system user,
copies the project to `/opt/hellocatbot`, installs `deploy/hellocat-web.service`
and starts the service.

Then put nginx in front of it:

```bash
sudo cp deploy/nginx/hellocat-web.conf /etc/nginx/sites-available/hellocat-web
sudo ln -s /etc/nginx/sites-available/hellocat-web /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Set these in `/opt/hellocatbot/.env` before starting:

```ini
WEB_PORT=8080
WEB_BASE_URL=https://quarterly-vaguest-milania.ngrok-free.dev
WEB_COOKIE_SECURE=true
OFFICIAL_SITE_URL=https://helloc.at
DISCORD_INVITE_URL=https://discord.gg/your-invite
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

## Sharing storage with the Discord bot

Both processes read and write `src/storage/data/*.json`. Writes are atomic
(temp file + rename) and are serialised with a lock file
(`src/utils/fileLock.js`), so the two processes can run side by side without
losing each other's updates. If you would rather isolate them, point the web
terminal at its own `DATA_DIR` — progress then has to be synced separately.

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

A challenge can require other challenges to be captured first (`prerequisites` in the
challenge definition). While the gate is closed the terminal refuses to load the
environment and refuses the flag submission, and the sidebar marks the entry with
🔒. The gate is evaluated per operator: once the prerequisite is captured, the
lab opens for that operator only.

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

Every `/api/*` route requires a valid session cookie, except `/api/public/stats`.

## Adding a lab

Create `web/labs/HC-0XX.json` next to the existing ones:

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

Then add the matching challenge to `challenges/<difficulty>/` and re-run
`npm run import -- --publish`. The lab is picked up automatically the next
time the service starts.

`files` is mounted as root; specify `owner`, `group`, `uid`, `gid` and `mode`
to control who can read what. Modes matter — several challenges are about
permissions, and `ls -l` renders them faithfully.

## Tests

```bash
npm test                              # whole suite
node --test tests/web-terminal.test.js
node --test tests/web-server.test.js
```

`tests/web-terminal.test.js` includes a table that drives every challenge with
the commands a solver would realistically use and asserts the answer is
reachable — so a broken lab fails the build rather than puzzling a student.

## Security notes

- No host command execution, ever. The command set is a fixed registry.
- No outbound network calls to arbitrary hosts; `curl` and `nmap` only see the
  lab's own inventory.
- Sessions live in memory and expire after two hours of inactivity.
- The session cookie is `HttpOnly`, `SameSite=Lax` and signed with HMAC-SHA256.
- Discord bot tokens are never sent to the browser; only `identify` scope is
  requested.
- Every flag is verified with the same HMAC scheme the Discord bot uses, so
  plaintext flags are never stored in the shared data files.
