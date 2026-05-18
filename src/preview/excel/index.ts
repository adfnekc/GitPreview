import { type PreviewHandler } from '../handler';
import { escapeHTML, formatFileSize } from '../../utils';
import { fetchBinary } from '../../lib/range-fetcher';
import { renderErrorContent } from '../ui';
import * as XLSX from 'xlsx';

export async function openExcelPreview(
  url: string,
  filename: string,
  container: HTMLElement,
): Promise<void> {
  container.innerHTML = `
    <div class="gitpreview-loading">
      <div class="gitpreview-spinner"></div>
      <div class="gitpreview-loading-text">Loading ${escapeHTML(filename)}...</div>
    </div>`;

  try {
    const arrayBuffer = await fetchBinary(url);
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetNames = workbook.SheetNames;

    // Build sheet tabs + content for all sheets
    let tabsHtml = '';
    let sheetsHtml = '';
    sheetNames.forEach((name, i) => {
      const sheet = workbook.Sheets[name];
      const html = XLSX.utils.sheet_to_html(sheet, { id: `gitpreview-excel-sheet-${i}` });
      tabsHtml += `<button class="gitpreview-excel-tab${i === 0 ? ' gitpreview-excel-tab-active' : ''}" data-sheet-index="${i}">${escapeHTML(name)}</button>`;
      sheetsHtml += `<div class="gitpreview-excel-sheet${i === 0 ? ' gitpreview-excel-sheet-active' : ''}" data-sheet-index="${i}">${html}</div>`;
    });

    container.innerHTML = `
      <div class="gitpreview-excel-preview">
        <div class="gitpreview-excel-header">
          <svg class="gitpreview-excel-header-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div class="gitpreview-excel-header-info">
            <div class="gitpreview-excel-filename">${escapeHTML(filename)}</div>
            <div class="gitpreview-excel-meta">${formatFileSize(arrayBuffer.byteLength)} · ${sheetNames.length} sheet(s)</div>
          </div>
        </div>
        <div class="gitpreview-excel-tabs">${tabsHtml}</div>
        <div class="gitpreview-excel-body">${sheetsHtml}</div>
      </div>`;

    // Sheet tab switching
    container.querySelectorAll('.gitpreview-excel-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const idx = (tab as HTMLElement).dataset.sheetIndex;
        if (!idx) return;

        container.querySelectorAll('.gitpreview-excel-tab').forEach((t) => t.classList.remove('gitpreview-excel-tab-active'));
        container.querySelectorAll('.gitpreview-excel-sheet').forEach((s) => s.classList.remove('gitpreview-excel-sheet-active'));
        tab.classList.add('gitpreview-excel-tab-active');
        const sheet = container.querySelector(`.gitpreview-excel-sheet[data-sheet-index="${idx}"]`);
        sheet?.classList.add('gitpreview-excel-sheet-active');
      });
    });
  } catch (err) {
    console.error('GitPreview excel error:', err);
    container.innerHTML = renderErrorContent(
      (err as Error).message || 'Failed to load spreadsheet',
    );
  }
}

export function closeExcelPreview(): void {
  // DOM cleanup is handled by removeExistingPlayer() in the caller.
}

export const excelHandler: PreviewHandler = {
  extensions: ['xlsx', 'xls'],
  getBlobButtonSelector() {
    return 'a[data-testid="raw-button"], a[href*="/raw/"], a#raw-url';
  },
  openPreview(rawUrl: string, filename: string, container?: HTMLElement) {
    if (!container) return;
    openExcelPreview(rawUrl, filename, container);
  },
};
