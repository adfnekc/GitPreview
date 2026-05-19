import { type PreviewHandler } from './handler';

const extensionMap = new Map<string, PreviewHandler>();
const handlerSet = new Set<PreviewHandler>();

export function registerHandler(handler: PreviewHandler): void {
  for (const ext of handler.extensions) {
    extensionMap.set(ext, handler);
  }
  handlerSet.add(handler);
}

export function getHandler(extension: string): PreviewHandler | undefined {
  return extensionMap.get(extension);
}

/** Check if an extension is supported by any registered handler. */
export function isSupported(extension: string): boolean {
  return extensionMap.has(extension);
}

/** Close all registered handlers. */
export function closeAllHandlers(): void {
  for (const handler of handlerSet) {
    handler.close?.();
  }
}

/** Get all registered handlers (for iteration). */
export function getAllHandlers(): PreviewHandler[] {
  return Array.from(handlerSet);
}
