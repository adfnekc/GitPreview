const PREFIX = '[GitPreview]';

/** True only in `vite dev` / unminified builds; false in production. */
const debugEnabled = (() => {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
})();

export function debug(...args: unknown[]): void {
  if (debugEnabled) console.log(PREFIX, ...args);
}

export function warn(...args: unknown[]): void {
  console.warn(PREFIX, ...args);
}

export function error(...args: unknown[]): void {
  console.error(PREFIX, ...args);
}
