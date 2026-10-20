import { describe, test, expect } from 'vitest';
import { deriveFilename } from '../../src/preview/pdf';

describe('deriveFilename', () => {
  const githubTitle = 'pdf.js/examples/learning/helloworld.pdf at master · mozilla/pdf.js · GitHub';

  test('prefers the file name passed by the content script', () => {
    expect(deriveFilename('helloworld.pdf', githubTitle)).toBe('helloworld.pdf');
  });

  test('takes the basename when the fallback contains a path', () => {
    expect(deriveFilename('pdf.js/examples/learning/helloworld.pdf', githubTitle)).toBe(
      'helloworld.pdf',
    );
  });

  test('falls back to the GitHub page title when the fallback is empty', () => {
    expect(deriveFilename('', githubTitle)).toBe('helloworld.pdf');
  });

  test('handles GitLab page titles', () => {
    expect(deriveFilename('docs/spec.pdf', 'spec.pdf · main · owner/repo · GitLab')).toBe(
      'spec.pdf',
    );
    expect(deriveFilename('', 'spec.pdf · main · owner/repo · GitLab')).toBe('spec.pdf');
  });

  test('decodes URL-encoded names and strips query strings', () => {
    expect(deriveFilename('%E4%B8%AD%E6%96%87.pdf', '')).toBe('中文.pdf');
    expect(deriveFilename('report.pdf?raw=1', '')).toBe('report.pdf');
  });

  test('never returns an empty name', () => {
    expect(deriveFilename('', '')).toBe('document.pdf');
    expect(deriveFilename('/', '')).toBe('document.pdf');
  });
});
