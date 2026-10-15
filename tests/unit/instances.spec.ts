import { describe, test, expect } from 'vitest';
import { instanceScriptId, isInstanceScriptId } from '../../src/lib/instances';

describe('instanceScriptId', () => {
  test('builds a stable id from the origin host', () => {
    expect(instanceScriptId('https://gitlab.example.com')).toBe(
      'gitpreview-gitlab-gitlab.example.com',
    );
  });

  test('ignores the path of the instance URL', () => {
    expect(instanceScriptId('https://gitlab.example.com/sub/path')).toBe(
      'gitpreview-gitlab-gitlab.example.com',
    );
  });

  test('falls back to the raw string when the origin is invalid', () => {
    expect(instanceScriptId('not a url')).toBe('gitpreview-gitlab-not_a_url');
  });
});

describe('isInstanceScriptId', () => {
  test('recognizes generated ids', () => {
    expect(isInstanceScriptId(instanceScriptId('https://gl.test'))).toBe(true);
  });

  test('rejects unrelated ids', () => {
    expect(isInstanceScriptId('other-id')).toBe(false);
  });
});
