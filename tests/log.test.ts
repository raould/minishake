import { describe, it, expect } from 'vitest';
import { LogWriter } from '../dist/log.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('log', () => {
  it('should write append-only jsonl log entries', () => {
    const writer = new LogWriter(process.cwd());
    writer.write({ kind: 'test', time: 100 });
    writer.write({ kind: 'complete', time: 200 });
    writer.close();
    
    expect(fs.existsSync(writer.filePath)).toBe(true);
    
    const lines = fs.readFileSync(writer.filePath, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).kind).toBe('test');
    expect(JSON.parse(lines[1]).time).toBe(200);
    
    // clean up
    fs.unlinkSync(writer.filePath);
  });
});
