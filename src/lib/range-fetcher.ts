import { base64ToArrayBuffer } from '../utils';

export interface FileInfo {
  size: number;
  acceptsRanges: boolean;
  mimeType: string;
}

export class RangeFetcher {
  static getFileInfo(url: string): Promise<FileInfo> {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'fetchHead', url }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response.success) {
            resolve({
              size: response.size,
              acceptsRanges: response.acceptsRanges,
              mimeType: response.mimeType,
            });
          } else {
            reject(new Error(response.error || 'Failed to get file info'));
          }
        });
      } else {
        reject(new Error('Chrome runtime not available'));
      }
    });
  }

  static fetchChunk(url: string, start: number, end: number): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          { action: 'fetchRange', url, start, end },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (response.success) {
              resolve(base64ToArrayBuffer(response.data));
            } else {
              reject(new Error(response.error || 'Failed to fetch chunk'));
            }
          },
        );
      } else {
        reject(new Error('Chrome runtime not available'));
      }
    });
  }

  static supportsRange(): boolean {
    return typeof MediaSource !== 'undefined' && MediaSource !== null;
  }
}

export function fetchBinary(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        { action: 'fetchBinary', url },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response.success) {
            resolve(base64ToArrayBuffer(response.data));
          } else {
            reject(new Error(response.error || 'Failed to fetch binary'));
          }
        },
      );
    } else {
      reject(new Error('Chrome runtime not available'));
    }
  });
}
