/**
 * Terminal fit addon.
 *
 * xterm.js 5.x keeps the "fit to container" logic in a separate addon package
 * that is not part of the vendored bundle, and the addon has to be handed to
 * `terminal.loadAddon()` as an object. Passing a name instead makes xterm
 * assign a `dispose` property to a string, which throws
 * "Cannot create property 'dispose' on string 'fit'".
 *
 * This implementation measures the terminal cell with the metrics the renderer
 * already knows, and falls back to measuring the font in the DOM.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HelloCatFit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_COLUMNS = 2;
  const MIN_ROWS = 1;

  /** The size of a single character cell in CSS pixels. */
  function measureCell(terminal) {
    const cell = terminal?._renderService?.dimensions?.css?.cell;
    if (cell && cell.width > 0 && cell.height > 0) {
      return { width: cell.width, height: cell.height };
    }

    const options = terminal?.options ?? {};
    const fontSize = options.fontSize ?? 13;
    const fontFamily = options.fontFamily ?? 'monospace';
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc?.body || typeof doc.createElement !== 'function') return null;

    const probe = doc.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;top:-9999px;left:-9999px;white-space:nowrap;';
    probe.style.fontFamily = fontFamily;
    probe.style.fontSize = `${fontSize}px`;
    probe.textContent = 'M'.repeat(100);
    doc.body.appendChild(probe);
    const width = probe.getBoundingClientRect ? probe.getBoundingClientRect().width / 100 : 0;
    probe.remove?.();
    if (!(width > 0)) return null;

    return { width, height: fontSize * (options.lineHeight ?? 1) };
  }

  /** The space the terminal may use inside its container. */
  function availableSpace(parent) {
    const view = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(parent)
      : null;
    const padding = (name, fallback) => {
      const value = view ? parseFloat(view[name]) : NaN;
      return Number.isFinite(value) ? value : fallback;
    };
    return {
      width: parent.clientWidth - padding('paddingLeft', 0) - padding('paddingRight', 0),
      height: parent.clientHeight - padding('paddingTop', 0) - padding('paddingBottom', 0),
    };
  }

  /**
   * Creates an xterm addon that resizes the terminal to its container.
   * The addon follows the xterm addon contract: `activate` receives the
   * terminal, `dispose` releases it.
   */
  function createFitAddon(terminal) {
    let instance = terminal ?? null;
    let disposed = false;

    function fit() {
      if (disposed || !instance) return;
      const parent = instance.element?.parentElement;
      if (!parent) return;

      const cell = measureCell(instance);
      if (!cell) return;

      const space = availableSpace(parent);
      if (!(space.width > 0) || !(space.height > 0)) return;

      const columns = Math.max(MIN_COLUMNS, Math.floor(space.width / cell.width));
      const rows = Math.max(MIN_ROWS, Math.floor(space.height / cell.height));
      if (columns === instance.cols && rows === instance.rows) return;
      instance.resize(columns, rows);
    }

    return {
      activate(activated) {
        if (activated) instance = activated;
      },
      dispose() {
        disposed = true;
        instance = null;
      },
      fit,
    };
  }

  return { createFitAddon, measureCell };
});
