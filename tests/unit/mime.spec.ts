import { describe, test, expect } from 'vitest';
import { getMimeType } from '../../src/lib/mime';

describe('getMimeType', () => {
  test('maps audio extensions', () => {
    expect(getMimeType('a.mp3')).toBe('audio/mpeg');
    expect(getMimeType('a.wav')).toBe('audio/wav');
    expect(getMimeType('a.ogg')).toBe('audio/ogg');
  });

  test('maps video extensions case-insensitively', () => {
    expect(getMimeType('dir/b.MP4')).toBe('video/mp4');
    expect(getMimeType('c.WEBM')).toBe('video/webm');
  });

  test('maps office and pdf documents', () => {
    expect(getMimeType('c.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(getMimeType('c.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(getMimeType('c.pptx')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(getMimeType('c.pdf')).toBe('application/pdf');
  });

  test('falls back to octet-stream', () => {
    expect(getMimeType('file.unknown')).toBe('application/octet-stream');
    expect(getMimeType('noextension')).toBe('application/octet-stream');
  });
});
