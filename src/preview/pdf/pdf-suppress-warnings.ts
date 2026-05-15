/**
 * Suppress known harmless PDF.js console warnings/errors that occur in
 * Chrome extension context (e.g., WebAssembly CSP restrictions, fallback URLs).
 *
 * This runs BEFORE viewer.mjs so it can intercept early initialization errors.
 * It also handles unhandled promise rejections from PDF.js internal fallbacks.
 */

const FILTER_PATTERNS = [
  'Unexpected server response',
  'compressed.tracemonkey-pldi-09',
  'JBig2CCITTFaxImage',
  'instantiateWasm',
  'Warning: Knockout groups not supported',
  'wasm-eval',
  'unsafe-eval',
  'CompileError',
  'ResponseException',
];

(function () {
  function shouldSuppress(args: unknown[]): boolean {
    const combined = args
      .map((a) => (typeof a === 'string' ? a : ''))
      .join(' ');
    return FILTER_PATTERNS.some((p) => combined.includes(p));
  }

  // Suppress console methods matching known harmless PDF.js patterns
  const patched: Array<keyof typeof console> = ['debug', 'log', 'warn', 'error'];
  patched.forEach((method) => {
    const orig = (console[method] as Function).bind(console);
    (console[method] as unknown as Function) = (...args: unknown[]) => {
      if (shouldSuppress(args)) return;
      orig(...args);
    };
  });

  // Suppress unhandled promise rejections from PDF.js internal fallbacks
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message =
      typeof reason === 'string'
        ? reason
        : reason?.message ?? reason?.toString?.() ?? '';
    if (typeof message === 'string' && FILTER_PATTERNS.some((p) => message.includes(p))) {
      event.preventDefault();
    }
  });
})();
