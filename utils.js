function getFileExtension(path) {
  const filename = path.split('/').pop().split('?')[0];
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

function isSupportedExtension(extension) {
  if (!extension) return false;
  const supportedExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
  return supportedExtensions.includes(extension.toLowerCase());
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

function formatTime(seconds) {
  if (!seconds || seconds < 0) return '0:00';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function isBlobPage(url) {
  return !!(url && url.includes('/blob/'));
}

function isTreePage(url) {
  return !!(url && url.includes('/tree/'));
}

function extractFilenameFromUrl(url) {
  if (!url) return '';
  
  const path = url.split('?')[0];
  const filename = path.split('/').pop();
  
  return filename;
}

function extractRawUrlFromBlobUrl(blobUrl) {
  if (!blobUrl) return '';
  
  return blobUrl
    .replace('github.com', 'raw.githubusercontent.com')
    .replace('/blob/', '/');
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getFileExtension,
    isSupportedExtension,
    escapeHTML,
    formatFileSize,
    formatTime,
    isBlobPage,
    isTreePage,
    extractFilenameFromUrl,
    extractRawUrlFromBlobUrl,
    clamp
  };
}

if (typeof window !== 'undefined') {
  window.GitPreviewUtils = {
    getFileExtension,
    isSupportedExtension,
    escapeHTML,
    formatFileSize,
    formatTime,
    isBlobPage,
    isTreePage,
    extractFilenameFromUrl,
    extractRawUrlFromBlobUrl,
    clamp
  };
}
