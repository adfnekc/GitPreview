import { describe, test, expect } from 'vitest';
import {
  getFileExtension,
  isSupportedExtension,
  escapeHTML,
  formatFileSize,
  formatTime,
  isBlobPage,
  isTreePage,
  extractFilenameFromUrl,
  convertToRawUrl,
  clamp,
} from '../../src/utils';

describe('getFileExtension', () => {
  test('gets extension from simple filename', () => {
    expect(getFileExtension('audio.mp3')).toBe('mp3');
    expect(getFileExtension('music.wav')).toBe('wav');
    expect(getFileExtension('sound.ogg')).toBe('ogg');
    expect(getFileExtension('track.m4a')).toBe('m4a');
    expect(getFileExtension('recording.flac')).toBe('flac');
    expect(getFileExtension('clip.aac')).toBe('aac');
  });

  test('gets extension from URL path', () => {
    expect(getFileExtension('/user/repo/blob/main/audio/test.mp3')).toBe('mp3');
    expect(
      getFileExtension('https://github.com/user/repo/blob/main/audio/test.wav'),
    ).toBe('wav');
    expect(
      getFileExtension(
        'https://github.com/user/repo/blob/main/music.ogg?raw=true',
      ),
    ).toBe('ogg');
  });

  test('handles files without extension', () => {
    expect(getFileExtension('README')).toBe('');
    expect(getFileExtension('LICENSE')).toBe('');
    expect(getFileExtension('Dockerfile')).toBe('');
    expect(getFileExtension('/user/repo/blob/main/Dockerfile')).toBe('');
  });

  test('handles files with multiple dots', () => {
    expect(getFileExtension('audio.test.mp3')).toBe('mp3');
    expect(getFileExtension('track.v1.0.wav')).toBe('wav');
    expect(getFileExtension('my.song.name.ogg')).toBe('ogg');
  });

  test('returns lowercase extension', () => {
    expect(getFileExtension('AUDIO.MP3')).toBe('mp3');
    expect(getFileExtension('Music.WAV')).toBe('wav');
    expect(getFileExtension('Test.Mp3')).toBe('mp3');
  });

  test('handles empty string', () => {
    expect(getFileExtension('')).toBe('');
  });

  test('handles dotfiles', () => {
    expect(getFileExtension('.gitignore')).toBe('gitignore');
    expect(getFileExtension('.env.local')).toBe('local');
  });
});

describe('isSupportedExtension', () => {
  test('returns true for supported audio extensions', () => {
    const supportedExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
    supportedExtensions.forEach((ext) => {
      expect(isSupportedExtension(ext)).toBe(true);
    });
  });

  test('returns false for unsupported extensions', () => {
    const unsupportedExtensions = [
      'txt',
      'js',
      'css',
      'html',
      'png',
      'jpg',
      'xlsx',
    ];
    unsupportedExtensions.forEach((ext) => {
      expect(isSupportedExtension(ext)).toBe(false);
    });
  });

  test('is case-insensitive', () => {
    expect(isSupportedExtension('MP3')).toBe(true);
    expect(isSupportedExtension('Wav')).toBe(true);
    expect(isSupportedExtension('mP3')).toBe(true);
    expect(isSupportedExtension('Ogg')).toBe(true);
  });

  test('handles empty string', () => {
    expect(isSupportedExtension('')).toBe(false);
  });

  test('handles null/undefined', () => {
    expect(isSupportedExtension(null)).toBe(false);
    expect(isSupportedExtension(undefined)).toBe(false);
  });
});

describe('escapeHTML', () => {
  test('escapes special characters', () => {
    const input = '<script>alert("xss")</script>';
    const output = escapeHTML(input);

    expect(output).not.toContain('<script>');
    expect(output).not.toContain('</script>');
    expect(output).toContain('&lt;');
    expect(output).toContain('&gt;');
  });

  test('escapes quotes', () => {
    const input = `'single' and "double" quotes`;
    const output = escapeHTML(input);

    expect(output).toContain('&#039;');
    expect(output).toContain('&quot;');
  });

  test('escapes ampersands', () => {
    const input = 'a & b & c';
    const output = escapeHTML(input);

    expect(output).toContain('&amp;');
    expect(output.match(/&amp;/g)!.length).toBe(2);
  });

  test('handles normal text', () => {
    expect(escapeHTML('hello world')).toBe('hello world');
    expect(escapeHTML('test.mp3')).toBe('test.mp3');
    expect(escapeHTML('my-song_123.wav')).toBe('my-song_123.wav');
  });

  test('handles empty string', () => {
    expect(escapeHTML('')).toBe('');
  });

  test('handles null/undefined', () => {
    expect(escapeHTML(null)).toBe('');
    expect(escapeHTML(undefined)).toBe('');
  });

  test('handles combined special characters', () => {
    const input = '<div class="test" onclick="alert(\'test\')">content</div>';
    const output = escapeHTML(input);

    expect(output).not.toContain('<div');
    expect(output).not.toContain('</div>');
    expect(output).toContain('&lt;');
    expect(output).toContain('&gt;');
    expect(output).toContain('&quot;');
    expect(output).toContain('&#039;');
  });
});

describe('formatFileSize', () => {
  test('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
    expect(formatFileSize(1)).toBe('1.00 Bytes');
    expect(formatFileSize(500)).toBe('500.00 Bytes');
  });

  test('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.00 KB');
    expect(formatFileSize(1536)).toBe('1.50 KB');
    expect(formatFileSize(104857)).toBe('102.40 KB');
  });

  test('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.00 MB');
    expect(formatFileSize(1572864)).toBe('1.50 MB');
    expect(formatFileSize(5242880)).toBe('5.00 MB');
  });

  test('formats gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1.00 GB');
    expect(formatFileSize(1610612736)).toBe('1.50 GB');
  });

  test('handles null/undefined/zero', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
    expect(formatFileSize(null)).toBe('0 Bytes');
    expect(formatFileSize(undefined)).toBe('0 Bytes');
  });

  test('handles negative values', () => {
    expect(formatFileSize(-1024)).toBe('0 Bytes');
  });
});

describe('formatTime', () => {
  test('formats seconds to MM:SS', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(30)).toBe('0:30');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(120)).toBe('2:00');
    expect(formatTime(125)).toBe('2:05');
  });

  test('handles minutes correctly', () => {
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(120)).toBe('2:00');
    expect(formatTime(180)).toBe('3:00');
    expect(formatTime(599)).toBe('9:59');
    expect(formatTime(600)).toBe('10:00');
  });

  test('pads single digit seconds', () => {
    expect(formatTime(1)).toBe('0:01');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(61)).toBe('1:01');
    expect(formatTime(129)).toBe('2:09');
  });

  test('handles null/undefined/negative', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(null)).toBe('0:00');
    expect(formatTime(undefined)).toBe('0:00');
    expect(formatTime(-1)).toBe('0:00');
    expect(formatTime(-60)).toBe('0:00');
  });

  test('handles decimal values', () => {
    expect(formatTime(60.5)).toBe('1:00');
    expect(formatTime(60.9)).toBe('1:00');
    expect(formatTime(61.1)).toBe('1:01');
  });
});

describe('isBlobPage', () => {
  test('returns true for blob page URLs', () => {
    expect(
      isBlobPage('https://github.com/user/repo/blob/main/file.mp3'),
    ).toBe(true);
    expect(
      isBlobPage('https://github.com/user/repo/blob/develop/audio.wav'),
    ).toBe(true);
    expect(isBlobPage('/user/repo/blob/main/test.ogg')).toBe(true);
  });

  test('returns false for non-blob URLs', () => {
    expect(isBlobPage('https://github.com/user/repo')).toBe(false);
    expect(isBlobPage('https://github.com/user/repo/tree/main')).toBe(false);
    expect(isBlobPage('https://github.com')).toBe(false);
    expect(isBlobPage('/user/repo/tree/main')).toBe(false);
  });

  test('handles null/undefined', () => {
    expect(isBlobPage(null)).toBe(false);
    expect(isBlobPage(undefined)).toBe(false);
    expect(isBlobPage('')).toBe(false);
  });
});

describe('isTreePage', () => {
  test('returns true for tree page URLs', () => {
    expect(isTreePage('https://github.com/user/repo/tree/main')).toBe(true);
    expect(
      isTreePage('https://github.com/user/repo/tree/develop/audio'),
    ).toBe(true);
    expect(isTreePage('/user/repo/tree/main')).toBe(true);
  });

  test('returns false for non-tree URLs', () => {
    expect(isTreePage('https://github.com/user/repo')).toBe(false);
    expect(
      isTreePage('https://github.com/user/repo/blob/main/file.mp3'),
    ).toBe(false);
    expect(isTreePage('https://github.com')).toBe(false);
    expect(isTreePage('/user/repo/blob/main')).toBe(false);
  });

  test('handles null/undefined', () => {
    expect(isTreePage(null)).toBe(false);
    expect(isTreePage(undefined)).toBe(false);
    expect(isTreePage('')).toBe(false);
  });
});

describe('extractFilenameFromUrl', () => {
  test('extracts filename from URL', () => {
    expect(
      extractFilenameFromUrl(
        'https://github.com/user/repo/blob/main/test.mp3',
      ),
    ).toBe('test.mp3');
    expect(
      extractFilenameFromUrl(
        'https://github.com/user/repo/blob/main/audio.wav',
      ),
    ).toBe('audio.wav');
    expect(extractFilenameFromUrl('/user/repo/blob/main/music.ogg')).toBe(
      'music.ogg',
    );
  });

  test('handles URLs with query parameters', () => {
    expect(
      extractFilenameFromUrl(
        'https://github.com/user/repo/blob/main/test.mp3?raw=true',
      ),
    ).toBe('test.mp3');
    expect(
      extractFilenameFromUrl('/user/repo/blob/main/audio.wav?foo=bar'),
    ).toBe('audio.wav');
  });

  test('handles simple paths', () => {
    expect(extractFilenameFromUrl('test.mp3')).toBe('test.mp3');
    expect(extractFilenameFromUrl('/audio.wav')).toBe('audio.wav');
  });

  test('handles null/undefined/empty', () => {
    expect(extractFilenameFromUrl(null)).toBe('');
    expect(extractFilenameFromUrl(undefined)).toBe('');
    expect(extractFilenameFromUrl('')).toBe('');
  });
});

describe('convertToRawUrl', () => {
  test('converts blob URL to raw URL', () => {
    expect(
      convertToRawUrl('https://github.com/user/repo/blob/main/test.mp3'),
    ).toBe('https://raw.githubusercontent.com/user/repo/main/test.mp3');

    expect(
      convertToRawUrl('https://github.com/user/repo/blob/develop/audio.wav'),
    ).toBe('https://raw.githubusercontent.com/user/repo/develop/audio.wav');
  });

  test('handles null/undefined/empty', () => {
    expect(convertToRawUrl('')).toBe('');
  });

  test('handles relative URLs starting with /', () => {
    expect(convertToRawUrl('/user/repo/blob/main/test.mp3')).toBe(
      'https://raw.githubusercontent.com/user/repo/main/test.mp3',
    );
  });

  test('handles URLs without github.com', () => {
    expect(convertToRawUrl('/user/repo/blob/main/test.mp3')).toBe(
      'https://raw.githubusercontent.com/user/repo/main/test.mp3',
    );
  });
});

describe('clamp', () => {
  test('clamps value within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  test('clamps values below minimum', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(0, 1, 10)).toBe(1);
    expect(clamp(-100, -50, 50)).toBe(-50);
  });

  test('clamps values above maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(100, 0, 50)).toBe(50);
    expect(clamp(50, -50, 0)).toBe(0);
  });

  test('handles negative ranges', () => {
    expect(clamp(-25, -50, 50)).toBe(-25);
    expect(clamp(-100, -50, 50)).toBe(-50);
    expect(clamp(100, -50, 50)).toBe(50);
  });

  test('handles decimal values', () => {
    expect(clamp(5.5, 0, 10)).toBe(5.5);
    expect(clamp(10.1, 0, 10)).toBe(10);
    expect(clamp(-0.1, 0, 10)).toBe(0);
  });
});
