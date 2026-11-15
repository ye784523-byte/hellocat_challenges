/*
 * Hello Cat — official landing page.
 *
 * The page is built for the phone first: a sticky header, a sticky dock with
 * the two calls to action, one column of content and a grid of targets.
 *
 * What this script does:
 *   - types the terminal demonstration,
 *   - decodes the headings when they scroll into view,
 *   - reveals the sections,
 *   - reads the live range counters,
 *   - opens and closes the mobile navigation,
 *   - shows the mobile dock only when it is useful.
 */

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
   * a decoder locks on. Child elements (`<br>`) are left alone.
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
    [{ text: '[+] catalogue loaded · 4 difficulties · 8 domains', cls: 'mock__dim' }],
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

  /* ----------------------------------------------------------- mobile nav */

  function startNavigation() {
    const toggle = document.getElementById('menu-toggle');
    const nav = document.getElementById('nav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('nav--open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('nav-open', open);
    });

    nav.addEventListener('click', (event) => {
      if (event.target.tagName !== 'A') return;
      nav.classList.remove('nav--open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-open');
    });
  }

  /* -------------------------------------------------------------- the dock */

  /**
   * The dock repeats the two calls to action at the bottom of the screen.
   * It is only useful once the header actions have scrolled away, and it is
   * in the way when the closing panel already shows the same two buttons.
   */
  function startDock() {
    const dock = document.getElementById('dock');
    const hero = document.getElementById('hero');
    const closing = document.querySelector('.closing');
    if (!dock || !hero) return;

    let pastHero = false;
    let atClosing = false;

    const paint = () => {
      const visible = pastHero && !atClosing;
      dock.classList.toggle('dock--visible', visible);
    };

    const observe = (element, handler) => {
      if (!element || !('IntersectionObserver' in window)) return;
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) handler(entry.isIntersecting);
      });
      observer.observe(element);
    };

    observe(hero, (isIntersecting) => {
      pastHero = !isIntersecting;
      paint();
    });

    observe(closing, (isIntersecting) => {
      atClosing = isIntersecting;
      paint();
    });
  }

  /* ----------------------------------------------------------------- year */

  function setYear() {
    const node = document.getElementById('year');
    if (node) node.textContent = String(new Date().getFullYear());
  }

  /* ----------------------------------------------------------------- init */

  renderMock(document.getElementById('mock'));
  startReveals();
  startNavigation();
  startDock();
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
