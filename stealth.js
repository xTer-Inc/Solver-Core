/**
 * Solver Core v3.4.1 — Stealth
 * Vô hiệu hóa các tín hiệu phát hiện tab ẩn / blur / focus / contextmenu.
 */
(function () {
  try {
    Object.defineProperty(Document.prototype, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(Document.prototype, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(Document.prototype, 'webkitHidden', { get: () => false, configurable: true });
    Object.defineProperty(Document.prototype, 'webkitVisibilityState', { get: () => 'visible', configurable: true });

    Document.prototype.hasFocus = () => true;
    window.onblur = null;
    window.onfocus = null;
    window.blur = () => {};
    window.focus = () => {};

    const blockEvents = ['visibilitychange', 'webkitvisibilitychange', 'blur', 'focus', 'pagehide', 'pageshow'];
    const origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, opts) {
      if (blockEvents.indexOf(type) !== -1 && (this === document || this === window)) return;
      return origAdd.call(this, type, listener, opts);
    };

    const origToString = Function.prototype.toString;
    Function.prototype.toString = function () {
      if (this === window.addEventListener || this === document.addEventListener) {
        return 'function addEventListener() { [native code] }';
      }
      return origToString.call(this);
    };

    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = window.chrome || { runtime: {} };

    document.addEventListener('copy', e => e.stopImmediatePropagation(), true);
    document.addEventListener('paste', e => e.stopImmediatePropagation(), true);
    document.addEventListener('contextmenu', e => e.stopImmediatePropagation(), true);
    document.exitFullscreen = () => Promise.resolve();
  } catch (e) {
    // fail-silent: stealth không được làm hỏng trang
    console.warn('[Solver:stealth] init warning:', e.message);
  }
})();
