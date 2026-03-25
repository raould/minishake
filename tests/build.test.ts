import { describe, it, expect, vi } from 'vitest';
import { refreshSourceHash } from '../dist/build.js';
import * as fs from 'node:fs';

vi.mock('node:fs', () => {
  return {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('build', () => {
  it('refreshSourceHash env', () => {
    process.env['FOO_TEST'] = '123';
    const node: any = { id: 'env:FOO_TEST', kind: 'env', hash: null };
    refreshSourceHash(node, '/root');
    expect(node.hash).toBeDefined();
    expect(typeof node.hash).toBe('string');
  });

  it('refreshSourceHash tool', () => {
    const node: any = { id: 'tool:node', kind: 'tool', hash: null };
    refreshSourceHash(node, '/root');
    expect(node.hash).toBeDefined();
    expect(typeof node.hash).toBe('string');
  });

  it('refreshSourceHash file missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const node: any = { id: 'file:missing.txt', kind: 'source', hash: null };
    expect(() => {
      refreshSourceHash(node, '/root');
    }).toThrow('source file not found: missing.txt');
  });
});
