import { type PreviewHandler, DEFAULT_BLOB_BUTTON_SELECTOR } from '../handler';
import { escapeHTML, formatFileSize } from '../../utils';

export const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];
import { fetchBinary } from '../../lib/range-fetcher';
import { renderErrorContent } from '../ui';

export async function openFontPreview(
  url: string,
  filename: string,
  container: HTMLElement,
): Promise<void> {
  const ext = filename.split('.').pop()?.toLowerCase() || 'ttf';

  container.innerHTML = `
    <div class="gitpreview-loading">
      <div class="gitpreview-spinner"></div>
      <div class="gitpreview-loading-text">Loading ${escapeHTML(filename)}...</div>
    </div>`;

  try {
    const arrayBuffer = await fetchBinary(url);

    const fontFamily = `__gp_font_${Date.now()}`;
    const fontFace = new FontFace(fontFamily, arrayBuffer, {
      style: 'normal',
      weight: 'normal',
      display: 'block',
    });

    await fontFace.load();
    document.fonts.add(fontFace);

    const sampleText = 'The quick brown fox jumps over the lazy dog';
    const sampleTextZh = '汉字字体预览 天地玄黄 宇宙洪荒 日月盈昃 辰宿列张';

    container.innerHTML = `
      <div class="gitpreview-font-preview">
        <div class="gitpreview-font-header">
          <svg class="gitpreview-font-header-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 7V4h16v3M9 20h6M12 4v16" />
          </svg>
          <div class="gitpreview-font-header-info">
            <div class="gitpreview-font-filename">${escapeHTML(filename)}</div>
            <div class="gitpreview-font-meta">${formatFileSize(arrayBuffer.byteLength)} · ${ext.toUpperCase()} font</div>
          </div>
          <div class="gitpreview-font-weight-wrapper">
            <label class="gitpreview-font-weight-label">Weight</label>
            <input class="gitpreview-font-weight-slider" type="range" min="100" max="900" step="100" value="400">
            <span class="gitpreview-font-weight-value">400</span>
          </div>
        </div>
        <div class="gitpreview-font-body">
          <div class="gitpreview-font-section">
            <div class="gitpreview-font-section-title">Custom Text</div>
            <input class="gitpreview-font-input" type="text" placeholder="Type something to preview..." spellcheck="false">
            <div class="gitpreview-font-custom" style="font-family: '${fontFamily}', serif;font-size:24px;line-height:1.5;padding:12px 16px">Type something above</div>
          </div>
          <div class="gitpreview-font-section">
            <div class="gitpreview-font-section-title">Sample Text</div>
            <div class="gitpreview-font-samples" style="font-family: '${fontFamily}', serif">
              <div class="gitpreview-font-sample-row" style="font-size:36px;line-height:1.4">${escapeHTML(sampleText)}</div>
              <div class="gitpreview-font-sample-row" style="font-size:24px;line-height:1.5">${escapeHTML(sampleText)}</div>
              <div class="gitpreview-font-sample-row" style="font-size:18px;line-height:1.6">${escapeHTML(sampleText)}</div>
              <div class="gitpreview-font-sample-row" style="font-size:14px;line-height:1.7">${escapeHTML(sampleText)}</div>
            </div>
          </div>
          <div class="gitpreview-font-section">
            <div class="gitpreview-font-section-title">Chinese Characters</div>
            <div class="gitpreview-font-samples" style="font-family: '${fontFamily}', serif">
              <div class="gitpreview-font-sample-row" style="font-size:24px;line-height:1.5">${escapeHTML(sampleTextZh)}</div>
              <div class="gitpreview-font-sample-row" style="font-size:18px;line-height:1.6">${escapeHTML(sampleTextZh)}</div>
            </div>
          </div>
          <div class="gitpreview-font-section">
            <div class="gitpreview-font-section-title">Character Set</div>
            <div class="gitpreview-font-samples" style="font-family: '${fontFamily}', serif">
              <div class="gitpreview-font-sample-row" style="font-size:16px;line-height:1.8;letter-spacing:1px">ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
              <div class="gitpreview-font-sample-row" style="font-size:16px;line-height:1.8;letter-spacing:1px">abcdefghijklmnopqrstuvwxyz</div>
              <div class="gitpreview-font-sample-row" style="font-size:16px;line-height:1.8;letter-spacing:1px">0123456789 · !@#$%^&amp;*()_+-=[]{}|;':",./&lt;&gt;?</div>
            </div>
          </div>
        </div>
      </div>`;

    const input = container.querySelector<HTMLInputElement>('.gitpreview-font-input');
    const customDisplay = container.querySelector<HTMLElement>('.gitpreview-font-custom');
    if (input && customDisplay) {
      input.addEventListener('input', () => {
        customDisplay.textContent = input.value || 'Type something above';
      });
    }

    const weightSlider = container.querySelector<HTMLInputElement>('.gitpreview-font-weight-slider');
    const weightValue = container.querySelector<HTMLElement>('.gitpreview-font-weight-value');
    const weightTargets = container.querySelectorAll<HTMLElement>(
      '.gitpreview-font-custom, .gitpreview-font-sample-row',
    );
    if (weightSlider && weightValue) {
      const updateWeight = () => {
        const w = weightSlider.value;
        const pct = ((+w - 100) / 800) * 100;
        weightValue.textContent = w;
        weightSlider.style.background = `linear-gradient(to right, #0969da 0%, #0969da ${pct}%, #d1d9e0 ${pct}%, #d1d9e0 100%)`;
        weightTargets.forEach((el) => { el.style.fontWeight = w; });
      };
      weightSlider.addEventListener('input', updateWeight);
    }
  } catch (err) {
    console.error('GitPreview font error:', err);
    container.innerHTML = renderErrorContent(
      (err as Error).message || 'Failed to load font',
    );
  }
}

export function closeFontPreview(): void {
  // FontFace objects persist in document.fonts, but that's harmless.
  // The DOM cleanup is handled by removeExistingPlayer() in the caller.
}

export const fontHandler: PreviewHandler = {
  extensions: FONT_EXTENSIONS,
  getBlobButtonSelector: () => DEFAULT_BLOB_BUTTON_SELECTOR,
  openPreview(rawUrl: string, filename: string, container?: HTMLElement) {
    if (!container) return;
    openFontPreview(rawUrl, filename, container);
  },
  close: closeFontPreview,
};
