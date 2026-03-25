import { describe, it, expect } from 'vitest';
import { toPosix, toNative } from '../dist/paths.js';
import * as path from 'node:path';

describe('paths', () => {
  it('toPosix should create relative posix paths', () => {
    const root = '/my/project/root';
    const filePath = '/my/project/root/src/file.ts';
    const result = toPosix(filePath, root);
    expect(result).toBe('src/file.ts');
  });

  it('toPosix should normalize correctly', () => {
    const root = '/my/proj';
    const result = toPosix('/my/proj/src/../lib/file.ts', root);
    expect(result).toBe('lib/file.ts');
  });

  it('toNative should convert posix back to absolute system paths', () => {
    const root = '/my/proj';
    const posix = 'src/app.ts' as any;
    const result = toNative(posix, root);
    expect(result).toBe(path.resolve(root, 'src/app.ts'));
  });
});
