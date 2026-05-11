import { escapeHTML, formatFileSize } from '../utils';

export class NetworkAware {
  static isExpensiveConnection(): boolean {
    const conn = (navigator as any).connection;
    if (!conn) return false;

    if (conn.type === 'cellular') return true;

    const effectiveType = conn.effectiveType;
    if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
      return true;
    }

    return false;
  }

  static exceedsThreshold(bytes: number, thresholdMB: number = 5): boolean {
    return bytes > thresholdMB * 1024 * 1024;
  }

  static shouldWarn(fileSize: number): boolean {
    return this.isExpensiveConnection() && this.exceedsThreshold(fileSize);
  }

  static confirmLoad(filename: string, size: number): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'gitpreview-warning-overlay';
      overlay.innerHTML = `
        <div class="gitpreview-warning-dialog">
          <h3 class="gitpreview-warning-title">Cellular Network Detected</h3>
          <p class="gitpreview-warning-message">
            Loading <strong>${escapeHTML(filename)}</strong> (${formatFileSize(size)}) over a cellular or metered connection may use significant data.
          </p>
          <div class="gitpreview-warning-actions">
            <button class="gitpreview-warning-cancel gitpreview-btn-secondary">Cancel</button>
            <button class="gitpreview-warning-continue gitpreview-btn-primary">Continue</button>
          </div>
        </div>`;

      const cancelBtn = overlay.querySelector('.gitpreview-warning-cancel')!;
      const continueBtn = overlay.querySelector('.gitpreview-warning-continue')!;

      const cleanup = (result: boolean) => {
        overlay.remove();
        resolve(result);
      };

      cancelBtn.addEventListener('click', () => cleanup(false));
      continueBtn.addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(false);
      });

      document.body.appendChild(overlay);
    });
  }
}
