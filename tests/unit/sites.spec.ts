import { describe, test, expect } from 'vitest';
import { githubAdapter } from '../../src/sites/github';
import { gitlabAdapter } from '../../src/sites/gitlab';
import { detectSite } from '../../src/sites/index';
import { convertToRawUrl } from '../../src/utils';

describe('githubAdapter', () => {
  test('matches github.com hosts', () => {
    expect(githubAdapter.matches(new URL('https://github.com/user/repo/blob/main/a.mp3'))).toBe(
      true,
    );
    expect(githubAdapter.matches(new URL('https://gitlab.com/g/p/-/blob/main/a.mp3'))).toBe(false);
  });

  test('isBlobPage / isTreePage', () => {
    expect(githubAdapter.isBlobPage('https://github.com/user/repo/blob/main/a.mp3')).toBe(true);
    expect(githubAdapter.isBlobPage('https://github.com/user/repo/tree/main')).toBe(false);
    expect(githubAdapter.isTreePage('https://github.com/user/repo/tree/main')).toBe(true);
  });

  test('toRawUrl matches utils.convertToRawUrl', () => {
    const url = 'https://github.com/user/repo/blob/main/test.mp3';
    expect(githubAdapter.toRawUrl(url)).toBe(convertToRawUrl(url));
  });

  test('getBlobPath extracts the file path', () => {
    expect(githubAdapter.getBlobPath('https://github.com/user/repo/blob/main/dir/a.mp3')).toBe(
      'main/dir/a.mp3',
    );
    expect(githubAdapter.getBlobPath('https://github.com/user/repo/tree/main')).toBeNull();
  });
});

describe('gitlabAdapter', () => {
  test('matches GitLab blob/tree/raw paths (any host, any sub-path)', () => {
    expect(gitlabAdapter.matches(new URL('https://gitlab.com/g/p/-/blob/main/a.mp3'))).toBe(true);
    expect(gitlabAdapter.matches(new URL('https://gl.example.com/pfx/g/p/-/tree/main'))).toBe(true);
    expect(gitlabAdapter.matches(new URL('https://gitlab.com/g/p'))).toBe(false);
  });

  test('isBlobPage / isTreePage', () => {
    expect(gitlabAdapter.isBlobPage('https://gitlab.com/g/p/-/blob/main/a.mp3')).toBe(true);
    expect(gitlabAdapter.isBlobPage('https://gitlab.com/g/p/-/tree/main')).toBe(false);
    expect(gitlabAdapter.isTreePage('https://gitlab.com/g/p/-/tree/main')).toBe(true);
  });

  test('toRawUrl converts /-/blob/ to /-/raw/', () => {
    expect(gitlabAdapter.toRawUrl('https://gitlab.com/g/p/-/blob/main/dir/a.mp3')).toBe(
      'https://gitlab.com/g/p/-/raw/main/dir/a.mp3',
    );
  });

  test('toRawUrl supports self-hosted sub-path instances', () => {
    expect(gitlabAdapter.toRawUrl('https://gl.example.com/gitlab/g/p/-/blob/main/a.pdf')).toBe(
      'https://gl.example.com/gitlab/g/p/-/raw/main/a.pdf',
    );
  });

  test('toRawUrl strips query and hash', () => {
    expect(
      gitlabAdapter.toRawUrl('https://gitlab.com/g/p/-/blob/main/a.mp3?ref_type=heads#x'),
    ).toBe('https://gitlab.com/g/p/-/raw/main/a.mp3');
  });

  test('toRawUrl returns empty string for non-blob URLs', () => {
    expect(gitlabAdapter.toRawUrl('https://gitlab.com/g/p/-/tree/main')).toBe('');
  });

  test('getBlobPath extracts the file path', () => {
    expect(gitlabAdapter.getBlobPath('https://gitlab.com/g/p/-/blob/main/dir/a.mp3')).toBe(
      'main/dir/a.mp3',
    );
    expect(gitlabAdapter.getBlobPath('https://gitlab.com/g/p/-/tree/main')).toBeNull();
  });
});

describe('detectSite', () => {
  test('detects github', () => {
    expect(detectSite(new URL('https://github.com/u/r/blob/main/a.mp3'))?.id).toBe('github');
  });

  test('detects gitlab.com and self-hosted', () => {
    expect(detectSite(new URL('https://gitlab.com/g/p/-/blob/main/a.mp3'))?.id).toBe('gitlab');
    expect(detectSite(new URL('https://gitlab.example.com/g/p/-/tree/main'))?.id).toBe('gitlab');
    expect(detectSite(new URL('https://example.com/pfx/g/p/-/blob/main/a.mp4'))?.id).toBe('gitlab');
  });

  test('returns null for unrelated pages', () => {
    expect(detectSite(new URL('https://gitlab.com/g/p'))).toBeNull();
    expect(detectSite(new URL('https://example.com/'))).toBeNull();
  });
});
