/* Hello Cat web terminal — client application. */

(() => {
  'use strict';

  const KALI_THEME = {
    background: '#070a08',
    foreground: '#c9e8d6',
    cursor: '#00ff88',
    cursorAccent: '#070a08',
    selectionBackground: 'rgba(0, 255, 136, 0.24)',
    black: '#0b100d',
    red: '#ff4d5e',
    green: '#00ff88',
    yellow: '#ffc857',
    blue: '#38bdf8',
    magenta: '#a78bfa',
    cyan: '#38bdf8',
    white: '#c9e8d6',
    brightBlack: '#4a6154',
    brightRed: '#ff7a86',
    brightGreen: '#5cffb0',
    brightYellow: '#ffd98a',
    brightBlue: '#7dd3fc',
    brightMagenta: '#c4b5fd',
    brightCyan: '#7dd3fc',
    brightWhite: '#eafff2',
  };

  const state = {
    terminal: null,
    challengeId: null,
    challenges: [],
    solved: new Set(),
    busy: false,
    filter: 'all',
    search: '',
    // The history of the session, oldest first. It is seeded from the server
    // so a reload does not lose the commands of the current lab.
    history: [],
    cwd: '/home/analyst',
  };

  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------------------------ utils */

  function toast(message, kind = 'info', ttl = 4200) {
    const element = $('toast');
    element.textContent = message;
    element.className = `toast toast--${kind}`;
    element.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      element.hidden = true;
    }, ttl);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (response.status === 401) {
      window.location.href = '/auth/login';
      throw new Error('unauthenticated');
    }
    if (!response.ok) {
      const error = new Error(payload.error ?? payload.message ?? `Request failed (${response.status})`);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  /* --------------------------------------------------------------- terminal */

  function createTerminal() {
    const terminal = new window.Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", "SFMono-Regular", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowTransparency: true,
      theme: KALI_THEME,
      convertEol: true,
    });

    // loadAddon() expects an addon object. Handing it a name makes xterm
    // assign a `dispose` property to that string and throw.
    const fitAddon = window.HelloCatFit?.createFitAddon?.(terminal) ?? null;
    if (fitAddon) {
      terminal.loadAddon(fitAddon);
      terminal.fit = () => fitAddon.fit();
    }

    terminal.open($('terminal'));

    let resizeTimer = 0;
    const fit = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        try {
          terminal.fit?.();
        } catch {
          /* not attached yet */
        }
      }, 50);
    };
    window.addEventListener('resize', fit);
    setTimeout(fit, 60);

    return terminal;
  }

  function write(text) {
    if (!text) return;
    state.terminal.write(text);
  }

  /* ------------------------------------------------------------- challenges */

  function difficultyClass(difficulty) {
    return `diff diff--${String(difficulty ?? '').toLowerCase()}`;
  }

  /** The challenge the info panel describes: the loaded one, or the first. */
  function activeChallenge() {
    if (!state.challengeId) return null;
    return state.challenges.find((challenge) => challenge.id === state.challengeId) ?? null;
  }

  /** Renders the brief of the loaded challenge in the left panel. */
  function renderInfo() {
    const challenge = activeChallenge();

    if (!challenge) {
      $('info-id').textContent = '—';
      $('info-title').textContent = 'No challenge loaded';
      $('info-meta').innerHTML = '<span class="diff diff--none">NO TARGET</span>';
      $('info-description').textContent =
        'Pick a target from the board to load its environment. The brief, the objective and the hints live here while you work.';
      $('info-objective').textContent = '—';
      $('info-prerequisites').textContent = 'none';
      $('info-hints').textContent = '0';
      $('info-xp').textContent = '0 XP';
      return;
    }

    $('info-id').textContent = challenge.id;
    $('info-title').textContent = challenge.title;
    $('info-meta').innerHTML = `
      <span class="${difficultyClass(challenge.difficulty)}">${escapeHtml(challenge.difficulty ?? 'Unknown')}</span>
      <span class="info__category">${escapeHtml(challenge.category ?? '')}</span>`;

    $('info-description').textContent =
      challenge.description ?? 'No description for this target yet.';
    $('info-objective').textContent = challenge.objective ?? '—';

    const prerequisites = challenge.prerequisites ?? [];
    $('info-prerequisites').textContent =
      prerequisites.length > 0 ? prerequisites.join(', ') : 'none';

    const hints = challenge.hints ?? 0;
    const revealed = challenge.hintsRevealed ?? 0;
    $('info-hints').textContent = hints > 0 ? `${revealed} of ${hints} revealed` : 'none';

    $('info-xp').textContent = `${challenge.xp ?? 0} XP`;

    // A sealed target says so, instead of failing when it is picked.
    if (challenge.locked) {
      $('info-description').textContent = `Sealed. Capture ${(challenge.missingPrerequisites ?? []).join(', ')} first to unseal this environment.`;
    }
  }

  function renderChallenges() {
    const list = $('challenge-list');
    list.innerHTML = '';

    const term = state.search.trim().toLowerCase();
    const visible = state.challenges.filter((challenge) => {
      if (term && !`${challenge.id} ${challenge.title} ${challenge.category}`.toLowerCase().includes(term)) {
        return false;
      }
      if (state.filter === 'solved') return challenge.solved;
      if (state.filter === 'unsolved') return !challenge.solved;
      return true;
    });

    $('challenge-count').textContent = String(state.challenges.length);

    if (visible.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'challenge';
      empty.style.cursor = 'default';
      empty.innerHTML = '<div class="challenge__title" style="color:var(--text-faint)">No challenges match.</div>';
      list.appendChild(empty);
      return;
    }

    for (const challenge of visible) {
      const item = document.createElement('li');
      item.className = `challenge${challenge.id === state.challengeId ? ' challenge--active' : ''}${challenge.locked ? ' challenge--locked' : ''}`;
      const gate = challenge.locked
        ? `<span class="challenge__locked" title="Locked: solve ${(challenge.missingPrerequisites ?? []).join(', ')}">🔒</span>`
        : '';
      item.innerHTML = `
        <div class="challenge__top">
          <span class="challenge__id">${challenge.id}</span>
          ${challenge.solved ? '<span class="challenge__solved">✔</span>' : ''}
          ${gate}
        </div>
        <div class="challenge__title">${escapeHtml(challenge.title)}</div>
        <div class="challenge__meta">
          <span class="${difficultyClass(challenge.difficulty)}">${challenge.difficulty}</span>
          <span>${escapeHtml(challenge.category)}</span>
          <span>${challenge.xp} XP</span>
        </div>`;
      item.addEventListener('click', () => startChallenge(challenge.id));
      list.appendChild(item);
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  async function loadChallenges() {
    const payload = await api('/api/challenges');
    state.challenges = payload.challenges ?? [];
    state.solved = new Set(state.challenges.filter((c) => c.solved).map((c) => c.id));
    renderChallenges();
    renderInfo();
  }

  async function startChallenge(id) {
    if (state.busy) return;
    state.busy = true;
    try {
      const payload = await api('/api/challenges/start', { method: 'POST', body: { id } });
      state.challengeId = payload.challenge?.id ?? id;

      const challenge = state.challenges.find((c) => c.id === state.challengeId);
      const label = $('stage-objective');
      label.innerHTML = `
        <span class="stage__label">${escapeHtml(state.challengeId)} // ${escapeHtml(payload.challenge?.title ?? challenge?.title ?? '')}</span>
        <span class="stage__hint">${escapeHtml(payload.objective ?? challenge?.objective ?? '')}</span>`;

      write(`\r\n\x1b[1;32m${payload.banner}\x1b[0m\r\n`);
      write(`\x1b[1;32mObjective:\x1b[0m ${payload.objective}\r\n\r\n`);
      write(payload.prompt);

      renderChallenges();
      renderInfo();
      toast(`Loaded ${state.challengeId}`, 'ok');
    } catch (error) {
      toast(error.message, 'err');
      write(`\x1b[31m${error.message}\x1b[0m\r\n`);
    } finally {
      state.busy = false;
    }
  }

  /* ------------------------------------------------------------------ flags */

  async function submitFlag(flag) {
    try {
      const payload = await api('/api/flag', { method: 'POST', body: { flag } });
      write(`\x1b[1;32m✔ ${payload.message}\x1b[0m\r\n`);
      toast(payload.message, 'ok');
      await refreshProgress();
    } catch (error) {
      const message = error.payload?.message ?? error.message;
      write(`\x1b[31m✘ ${message}\x1b[0m\r\n`);
      toast(message, 'err');
    }
  }

  async function requestHint() {
    try {
      const payload = await api('/api/hint', { method: 'POST' });
      write(`\x1b[1;33mHint:\x1b[0m ${payload.text}\r\n`);

      const bar = $('hintbar');
      if (bar) {
        bar.innerHTML = `<span class="hintbar__label">HINT ${payload.index + 1}</span><span class="hintbar__text">${escapeHtml(payload.text)}</span>`;
        bar.hidden = false;
      }

      toast(`Hint: ${payload.text}`, 'info', 8000);
      await refreshProgress();
    } catch (error) {
      const message = error.payload?.message ?? error.message;
      write(`\x1b[33m${message}\x1b[0m\r\n`);
      toast(message, 'err');
    }
  }

  async function refreshProgress() {
    const payload = await api('/api/session');
    $('stat-xp').textContent = String(payload.user?.xp ?? 0);
    $('stat-solved').textContent = String(payload.progress?.solved ?? 0);
    await loadChallenges();
  }

  /* ------------------------------------------------------------------- exec */

  /** The working directory, shortened the way the prompt shortens it. */
  function shortPath(cwd) {
    const home = '/home/analyst';
    if (!cwd) return '~';
    return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  }

  function renderPath(cwd) {
    state.cwd = cwd ?? state.cwd;
    const node = $('stage-path');
    if (node) node.textContent = shortPath(state.cwd);
  }

  async function runCommand(command) {
    if (state.busy) return;
    state.busy = true;
    try {
      const payload = await api('/api/terminal/exec', { method: 'POST', body: { command } });
      if (payload.stdout) write(payload.stdout);
      if (payload.stderr) write(payload.stderr);
      state.prompt = payload.prompt ?? state.prompt;
      renderPath(payload.cwd);
      write(state.prompt);
    } catch (error) {
      write(`\x1b[31m${error.message}\x1b[0m\r\n`);
    } finally {
      state.busy = false;
    }
  }

  /* ------------------------------------------------------------------ setup */

  function setupTerminalInput() {
    let buffer = '';
    let cursor = 0;
    let historyIndex = -1;

    // The history of the session: the commands the server remembers plus the
    // ones typed in this tab. The arrow keys walk it.
    const history = () => state.history;

    const redraw = () => {
      state.terminal.write('\x1b[2K\r');
      state.terminal.write(`${state.prompt ?? ''}${buffer}`);
      const back = buffer.length - cursor;
      if (back > 0) state.terminal.write(`\x1b[${back}D`);
    };

    state.terminal.onData(async (data) => {
      const key = data;

      if (key === '\r') {
        const command = buffer;
        buffer = '';
        cursor = 0;
        historyIndex = -1;
        if (command.trim()) {
          state.history.push(command);
          if (state.history.length > 500) state.history.shift();
        }
        state.terminal.write('\r\n');
        if (command.trim()) await runCommand(command);
        else write(state.prompt ?? '');
        return;
      }

      if (key === '\u007f') {
        if (cursor > 0) {
          buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
          cursor -= 1;
          redraw();
        }
        return;
      }

      // The arrow keys walk the history: up goes back, down goes forward.
      if (key === '\u001b[A' || key === '\u001b[B') {
        const entries = history();
        if (entries.length === 0) return;

        if (key === '\u001b[A') {
          historyIndex = Math.min(historyIndex + 1, entries.length - 1);
        } else if (historyIndex > 0) {
          historyIndex -= 1;
        } else {
          // One step below the oldest entry: the line is empty again.
          historyIndex = -1;
        }

        buffer = historyIndex === -1 ? '' : entries[entries.length - 1 - historyIndex];
        cursor = buffer.length;
        redraw();
        return;
      }

      // Ctrl+R walks the history the other way round, from the newest entry.
      if (key === '\u0012') {
        const entries = history();
        if (entries.length === 0) return;

        const query = buffer.trim().toLowerCase();
        const from = historyIndex === -1 ? entries.length - 1 : entries.length - 1 - historyIndex - 1;
        let found = -1;
        for (let index = from; index >= 0; index -= 1) {
          if (!query || entries[index].toLowerCase().includes(query)) {
            found = index;
            break;
          }
        }
        if (found === -1) return;

        historyIndex = entries.length - 1 - found;
        buffer = entries[found];
        cursor = buffer.length;
        redraw();
        return;
      }

      if (key === '\u0003') {
        buffer = '';
        cursor = 0;
        historyIndex = -1;
        write('^C\r\n');
        write(state.prompt ?? '');
        return;
      }

      if (key === '\u000c') {
        write('\x1b[2J\x1b[H');
        return;
      }

      if (key === '\t') {
        return;
      }

      // Any other key starts a new line, so the history is left behind.
      if (buffer.length === 0) historyIndex = -1;

      // Ignore other control sequences.
      if (key < ' ' && key !== '\t') return;

      buffer = buffer.slice(0, cursor) + key + buffer.slice(cursor);
      cursor += key.length;
      state.terminal.write(key);
    });
  }

  function setupEvents() {
    const events = new EventSource('/api/terminal/events');
    events.addEventListener('solved', (event) => {
      const payload = JSON.parse(event.data);
      toast(payload.message ?? 'Challenge solved', 'ok');
    });
    events.addEventListener('challenge', () => {});
  }

  function setupPanel() {
    $('challenge-search').addEventListener('input', (event) => {
      state.search = event.target.value;
      renderChallenges();
    });

    for (const pill of document.querySelectorAll('#challenge-filters .pill')) {
      pill.addEventListener('click', () => {
        for (const other of document.querySelectorAll('#challenge-filters .pill')) {
          other.classList.remove('pill--active');
        }
        pill.classList.add('pill--active');
        state.filter = pill.dataset.filter;
        renderChallenges();
      });
    }

    $('btn-labs').addEventListener('click', () => {
      $('panel').classList.toggle('panel--open');
    });

    $('btn-hint').addEventListener('click', requestHint);
    $('btn-submit').addEventListener('click', () => {
      const form = $('flag-form');
      form.hidden = !form.hidden;
      if (!form.hidden) $('flag-input').focus();
    });
    $('flag-cancel').addEventListener('click', () => {
      $('flag-form').hidden = true;
    });

    $('flag-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = $('flag-input');
      const flag = input.value.trim();
      if (!flag) return;
      input.value = '';
      $('flag-form').hidden = true;
      await submitFlag(flag);
    });
  }

  async function boot() {
    const status = $('boot-status');

    try {
      const payload = await api('/api/session');

      $('profile-name').textContent = payload.user?.username ?? 'operator';
      $('stat-xp').textContent = String(payload.user?.xp ?? 0);
      $('stat-solved').textContent = String(payload.progress?.solved ?? 0);
      if (payload.user?.avatar) {
        $('avatar').src = `https://cdn.discordapp.com/avatars/${payload.user.id}/${payload.user.avatar}.png`;
      }

      status.textContent = 'Mounting lab environment…';
      state.terminal = createTerminal();
      setupTerminalInput();
      setupEvents();
      setupPanel();

      write(`\x1b[1;32m  ▄▄▄▄▄▄   ▄▄▄▄▄▄▄▄▄▄\x1b[0m\r\n`);
      write(`\x1b[1;32m ██▀▀▀██  ██▀▀▀██  ██▀▀▀██\x1b[0m\r\n`);
      write(`\x1b[1;32m ██    ██ ██    ██ ██    ██\x1b[0m\r\n`);
      write(`\x1b[1;32m ██▄▄▄██  ██▄▄▄██  ██▄▄▄██\x1b[0m\r\n`);
      write(`\x1b[1;32m  ▀▀▀▀▀▀   ▀▀▀▀▀▀▀▀▀▀\x1b[0m\r\n`);
      write(`\x1b[1;32m       HELLO CAT LABS\x1b[0m\r\n\r\n`);
      write(`\x1b[2mEvery system here is fictional. Commands run against an in-memory filesystem.\x1b[0m\r\n`);
      write(`\x1b[2mType \x1b[0mhelp\x1b[2m for the command list or \x1b[0mchallenges\x1b[2m to list the lab.\x1b[0m\r\n\r\n`);

      state.prompt = payload.prompt ?? buildPrompt(payload.cwd, payload.hostname);
      write(state.prompt);

      // The history of the session survives a reload.
      state.history = [...(payload.history ?? [])];
      renderPath(payload.cwd);
      renderInfo();

      await loadChallenges();

      $('boot').hidden = true;
      $('shell').hidden = false;
      setTimeout(() => state.terminal.fit?.(), 80);
      state.terminal.focus();

      // Deep link from the Discord channel assistant: /terminal?challenge=HC-001
      await openRequestedChallenge(payload.challenge);
    } catch (error) {
      status.textContent = `Failed to start: ${error.message}`;
      status.style.color = 'var(--red)';
    }
  }

  /** Loads the challenge requested in the URL, if there is one. */
  async function openRequestedChallenge(currentChallenge) {
    const requested = new URLSearchParams(window.location.search).get('challenge');
    if (!requested) return;
    const id = requested.trim().toUpperCase();
    if (!id || id === currentChallenge) return;

    const known = state.challenges.some((challenge) => challenge.id === id);
    if (!known) {
      toast(`Challenge ${id} is not on the board right now.`, 'err');
      return;
    }
    await startChallenge(id);
  }

  function buildPrompt(cwd, hostname) {
    const home = '/home/analyst';
    const short = cwd?.startsWith(home) ? `~${cwd.slice(home.length)}` : (cwd ?? '~');
    return `\x1b[1;32m${window.__HC_USER__ ?? 'analyst'}\x1b[0m@\x1b[1;32m${hostname ?? 'kali-lab'}\x1b[0m:\x1b[1;34m${short}\x1b[0m$ `;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
