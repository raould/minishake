import { describe, it, expect } from 'vitest';
import { hashBytes, hashString, hashFileContents } from '../dist/hash.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('hash', () => {
  it('hashString should generate stable sha256', () => {
    const res = hashString('hello world');
    // sha256 of 'hello world'
    expect(res).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('hashBytes should work identically for string and buffer', () => {
    const s = 'test content';
    const b = Buffer.from(s);
    expect(hashBytes(s)).toBe(hashBytes(b));
  });

  it('hashFileContents should hash the file content correctly', () => {
    const tempFile = path.join(process.cwd(), 'tests', 'temp-hash.txt');
    fs.writeFileSync(tempFile, 'file content');
    const expected = hashString('file content');
    expect(hashFileContents(tempFile)).toBe(expected);
    fs.unlinkSync(tempFile);
  });
});
