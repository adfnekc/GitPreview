import { type PreviewHandler } from './handler';

const extensionMap = new Map<string, PreviewHandler>();

export function registerHandler(handler: PreviewHandler): void {
  for (const ext of handler.extensions) {
    extensionMap.set(ext, handler);
  }
}

export function getHandler(extension: string): PreviewHandler | undefined {
  return extensionMap.get(extension);
}

/** Check if an extension is supported by any registered handler. */
export function isSupported(extension: string): boolean {
  return extensionMap.has(extension);
}
