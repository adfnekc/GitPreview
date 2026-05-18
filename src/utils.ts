export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
export const PDF_EXTENSIONS = ['pdf'];
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
export const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];
export const WORD_EXTENSIONS = ['docx'];
export const EXCEL_EXTENSIONS = ['xlsx', 'xls'];
export const PPT_EXTENSIONS = ['pptx', 'ppt'];

export function getFileExtension(path: string): string {
  const filename = path.split('/').pop()!.split('?')[0];
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

export const ALL_EXTENSIONS = [
  ...AUDIO_EXTENSIONS, ...PDF_EXTENSIONS, ...VIDEO_EXTENSIONS,
  ...FONT_EXTENSIONS, ...WORD_EXTENSIONS, ...EXCEL_EXTENSIONS, ...PPT_EXTENSIONS,
];

export function isSupportedExtension(ext: string | null | undefined): boolean {
  if (!ext) return false;
  return ALL_EXTENSIONS.includes(ext.toLowerCase());
}

export function escapeHTML(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

export function formatTime(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function isBlobPage(url: string | null | undefined): boolean {
  return !!(url && url.includes('/blob/'));
}

export function isTreePage(url: string | null | undefined): boolean {
  return !!(url && url.includes('/tree/'));
}

export function extractFilenameFromUrl(url: string | null | undefined): string {
  if (!url) return '';
  const path = url.split('?')[0];
  return path.split('/').pop() || '';
}

export function convertToRawUrl(githubUrl: string): string {
  if (!githubUrl) return '';
  let url = githubUrl;
  if (url.startsWith('/')) {
    url = 'https://github.com' + url;
  }
  if (url.includes('/blob/')) {
    url = url.replace('github.com', 'raw.githubusercontent.com');
    url = url.replace('/blob/', '/');
  }
  return url;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const byteString = atob(base64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
