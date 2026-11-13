/*
 * Hello Cat — official landing page.
 *
 * Three pieces of theatre and three pieces of substance:
 *   - the rain behind the page,
 *   - the decode effect on the headings,
 *   - the boot overlay,
 *   - the live range counters,
 *   - the terminal mock,
 *   - the mobile navigation.
 */

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ boot */

  const boot = document.getElementById('boot');
  const bootStatus = document.getElementById('boot-status');

  if (boot) {
    if (reduceMotion) {
      boot.classList.add('boot--done');
    } else {
      const lines = [
        'Establishing a secure channel…',
        'Handshaking with the rabbit hole…',
        'Range online. Welcome, operator.',
      ];
      let step = 0;
      const timer = setInterval(() => {
        step += 1;
        if (step < lines.length) {
          if (bootStatus) bootStatus.textContent = lines[step];
          return;
        }
        clearInterval(timer);
        boot.classList.add('boot--done');
      }, 380);
      // The overlay also fades on its own, so a blocked timer cannot trap the
      // visitor behind it.
      setTimeout(() => boot.classList.add('boot--done'), 2600);
    }
  }

  /* ------------------------------------------------------------------ rain */

  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*+=<>/\\|[]{}アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';

  function startRain() {
    const canvas = document.getElementById('rain');
    if (!canvas || reduceMotion) return;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;

    const fontSize = 15;
    let columns = 0;
    let drops = [];
    let width = 0;
    let height = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.font = `${fontSize}px "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace`;

      columns = Math.ceil(width / fontSize);
      drops = Array.from({ length: columns }, () => ({
        y: Math.random() * -60,
        speed: 0.5 + Math.random() * 1.4,
        length: 6 + Math.floor(Math.random() * 12),
      }));
      context.fillStyle = '#070a08';
      context.fillRect(0, 0, width, height);
    }

    let last = performance.now();
    let lastDraw = 0;

    function frame(now) {
      // The rain is drawn at 30 frames per second: the glyphs are a backdrop,
      // not an animation, and the phone battery is worth more than the extra
      // frames.
      if (now - lastDraw < 33) {
        requestAnimationFrame(frame);
        return;
      }

      const delta = Math.min(now - last, 64);
      last = now;
      lastDraw = now;

      // The trail is the fade itself: a translucent wash over the last frame.
      context.fillStyle = 'rgba(7, 10, 8, 0.09)';
      context.fillRect(0, 0, width, height);

      for (let index = 0; index < columns; index += 1) {
        const drop = drops[index];
        const x = index * fontSize;
        const head = Math.floor(drop.y / fontSize);

        for (let offset = 0; offset < drop.length; offset += 1) {
          const row = head - offset;
          if (row < 0 || row * fontSize > height) continue;
          const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          context.fillStyle = offset === 0 ? 'rgba(190, 255, 222, 0.95)' : 'rgba(0, 255, 136, 0.42)';
          context.fillText(glyph, x, row * fontSize + fontSize);
        }

        drop.y += drop.speed * (delta / 16.67);
        if (drop.y - drop.length * fontSize > height) {
          drop.y = Math.random() * -20;
          drop.speed = 0.5 + Math.random() * 1.4;
          drop.length = 6 + Math.floor(Math.random() * 12);
        }
      }

      requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });

    const pause = () => {
      if (document.hidden) last = performance.now();
    };
    document.addEventListener('visibilitychange', pause);

    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- decode */

  const GLYPH_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*';

  function textNodesOf(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }

  /**
   * Scrambles the text of an element and settles it letter by letter, the way
   * a matrix decoder locks on. Child elements (`<br>`) are left alone.
   */
  function decode(element) {
    const nodes = textNodesOf(element).filter((node) => node.data.trim().length > 0);
    if (nodes.length === 0) return;

    const states = nodes.map((node) => ({ node, original: node.data, revealed: 0 }));

    const tick = () => {
      let pending = false;

      for (const state of states) {
        const chars = [...state.original];
        if (state.revealed >= chars.length) continue;
        pending = true;
        state.revealed += 1;
        state.node.data = chars
          .map((char, index) => {
            if (index < state.revealed) return char;
            if (char === ' ') return ' ';
            return GLYPH_POOL[Math.floor(Math.random() * GLYPH_POOL.length)];
          })
          .join('');
      }

      if (pending) setTimeout(tick, 26);
    };

    setTimeout(tick, 40);
  }

  function decodeAll(selector) {
    for (const element of document.querySelectorAll(selector)) decode(element);
  }

  /* --------------------------------------------------------------- reveals */

  function startReveals() {
    const elements = document.querySelectorAll('.reveal');
    if (elements.length === 0) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      for (const element of elements) element.classList.add('reveal--visible');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const delay = Number(entry.target.dataset.delay ?? 0);
          setTimeout(() => entry.target.classList.add('reveal--visible'), delay);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    for (const element of elements) observer.observe(element);
  }

  /* ------------------------------------------------------------ the mock */

  const MOCK_SCRIPT = [
    [{ text: 'analyst@kali-lab:~$', cls: 'mock__prompt' }, { text: ' challenges' }],
    [{ text: '[+] catalogue loaded', cls: 'mock__dim' }],
    [{ text: 'HC-001  System Whisper        LINUX   EASY', cls: 'mock__dim' }],
    [{ text: 'HC-003  Robots Never Lie      WEB     EASY', cls: 'mock__dim' }],
    [{ text: 'HC-013  Encoded Artifact      FOREN   HARD', cls: 'mock__dim' }],
    [{ text: '' }],
    [{ text: 'analyst@kali-lab:~$', cls: 'mock__prompt' }, { text: ' start HC-006' }],
    [{ text: '[+] lab loaded · target.rabbit.lab (10.20.0.44)', cls: 'mock__ok' }],
    [{ text: 'analyst@kali-lab:~$', cls: 'mock__prompt' }, { text: ' submit HC{...}' }],
    [{ text: '[!] CAPTURED · +150 XP · rank CYBER ANALYST', cls: 'mock__ok' }],
  ];

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderMock(target) {
    if (!target) return;

    const renderSegment = (segment, text) =>
      segment.cls ? `<span class="${segment.cls}">${escapeHtml(text)}</span>` : escapeHtml(text);

    if (reduceMotion) {
      target.innerHTML = MOCK_SCRIPT.map(
        (line) => `${line.map((segment) => renderSegment(segment, segment.text)).join('')}\n`,
      ).join('');
      return;
    }

    const completed = [];
    let lineIndex = 0;
    let segmentIndex = 0;
    let character = 0;
    let current = '';

    const paint = () => {
      const line = MOCK_SCRIPT[lineIndex];
      const segment = line?.[segmentIndex];
      const parts = [...completed];
      if (current) parts.push(renderSegment(segment ?? {}, current));
      target.innerHTML = `${parts.join('')}<span class="mock__cursor"></span>`;
    };

    const step = () => {
      if (lineIndex >= MOCK_SCRIPT.length) {
        target.innerHTML = completed.join('');
        return;
      }

      const line = MOCK_SCRIPT[lineIndex];
      const segment = line[segmentIndex];
      const text = segment?.text ?? '';

      if (character < text.length) {
        current += text[character];
        character += 1;
        paint();
        setTimeout(step, 16);
        return;
      }

      // The segment is complete: close it and move to the next one.
      completed.push(renderSegment(segment, current));
      current = '';
      segmentIndex += 1;
      character = 0;

      if (segmentIndex >= line.length) {
        completed.push('\n');
        lineIndex += 1;
        segmentIndex = 0;
        setTimeout(step, 140);
        return;
      }

      setTimeout(step, 40);
    };

    step();
  }

  /* --------------------------------------------------------------- stats */

  async function loadStats() {
    const nodes = document.querySelectorAll('[data-stat]');
    if (nodes.length === 0) return;

    // The range always covers every domain and every level, so those two
    // counters come from the grid itself; only the counts are live.
    const domains = document.querySelectorAll('[data-stat^="category:"]').length;
    const levels = document.querySelectorAll('[data-stat^="difficulty:"]').length;

    try {
      const response = await fetch('/api/public/stats', { headers: { accept: 'application/json' } });
      if (!response.ok) return;
      const stats = await response.json();

      for (const node of nodes) {
        const key = node.dataset.stat ?? '';
        let value = null;

        if (key === 'total') value = stats.total;
        else if (key === 'categories') value = domains;
        else if (key === 'difficulties') value = levels;
        else if (key.startsWith('category:')) value = stats.categories?.[key.slice(8)] ?? 0;
        else if (key.startsWith('difficulty:')) value = stats.difficulties?.[key.slice(11)] ?? 0;

        if (value === null || value === undefined) continue;
        node.textContent = String(value);
      }
    } catch {
      // The counters stay as placeholders when the catalogue cannot be read.
    }
  }

  /* ------------------------------------------------------------ mobile nav */

  function startNavigation() {
    const toggle = document.getElementById('menu-toggle');
    const nav = document.getElementById('nav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('nav--open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    nav.addEventListener('click', (event) => {
      if (event.target.tagName !== 'A') return;
      nav.classList.remove('nav--open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  }

  /* ----------------------------------------------------------------- year */

  function setYear() {
    const node = document.getElementById('year');
    if (node) node.textContent = String(new Date().getFullYear());
  }

  /* ----------------------------------------------------------------- boot */

  startRain();
  renderMock(document.getElementById('mock'));
  startReveals();
  startNavigation();
  setYear();
  loadStats();

  if (!reduceMotion) {
    decodeAll('.hero .eyebrow');
    decodeAll('.hero__title');
    const observer =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                decode(entry.target);
                observer.unobserve(entry.target);
              }
            },
            { threshold: 0.4 },
          )
        : null;

    if (observer) {
      for (const element of document.querySelectorAll('.section__head [data-decode], .closing__line')) {
        observer.observe(element);
      }
    } else {
      decodeAll('.section__head [data-decode], .closing__line');
    }
  }
})();
