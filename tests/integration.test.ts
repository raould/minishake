import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SHK_BIN = path.resolve(process.cwd(), 'dist/shk.js');
const EXAMPLE_DIR = path.resolve(process.cwd(), 'example');
const SRC_FILE = path.join(EXAMPLE_DIR, 'src/core.ts');
const OUT_FILE = path.join(EXAMPLE_DIR, 'dist/uses.js');
const GRAPH_FILE = path.join(EXAMPLE_DIR, '.shk/graph/build-graph.json');

function runShk(args: string[], cwd = EXAMPLE_DIR) {
  try {
    return execFileSync(process.execPath, [SHK_BIN, ...args], { cwd, encoding: 'utf-8' });
  } catch (err: any) {
    throw new Error(`Command failed: shk ${args.join(' ')}\nOutput: ${err.stdout}\nError: ${err.stderr}`);
  }
}

describe('Integration: example project', () => {
  beforeAll(() => {
    try { execFileSync(process.execPath, [SHK_BIN, 'clean'], { cwd: EXAMPLE_DIR }); } catch(e) {}
    try { fs.rmSync(path.join(EXAMPLE_DIR, 'dist'), { recursive: true, force: true }); } catch(e) {}
    try { execFileSync('git', ['checkout', 'src/core.ts'], { cwd: EXAMPLE_DIR }); } catch(e) {}
  });

  afterAll(() => {
    try { execFileSync(process.execPath, [SHK_BIN, 'clean'], { cwd: EXAMPLE_DIR }); } catch(e) {}
    try { fs.rmSync(path.join(EXAMPLE_DIR, 'dist'), { recursive: true, force: true }); } catch(e) {}
    try { execFileSync('git', ['checkout', 'src/core.ts'], { cwd: EXAMPLE_DIR }); } catch(e) {}
  });

  it('Basic Build: should compile src/*.ts to dist/', () => {
    const out = runShk(['build', 'compile']);
    expect(out).toContain('compile built successfully');
    expect(fs.existsSync(OUT_FILE)).toBe(true);
  });

  it('No-op Build: should not re-execute if nothing changed', () => {
    const beforeStat = fs.statSync(OUT_FILE);
    // Add a tiny delay to ensure timestamps would differ if it ran
    execFileSync('node', ['-e', 'setTimeout(()=>{}, 200)']);
    const out = runShk(['build', 'compile']);
    expect(out).toContain('compile built successfully');
    const afterStat = fs.statSync(OUT_FILE);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
  });

  it('Incremental Build: should re-execute if an input changes', () => {
    const beforeStat = fs.statSync(OUT_FILE);
    execFileSync('node', ['-e', 'setTimeout(()=>{}, 200)']);
    
    // modify file
    const content = fs.readFileSync(SRC_FILE, 'utf-8');
    fs.writeFileSync(SRC_FILE, content + '\n// modified\n');
    
    const out = runShk(['build', 'compile']);
    expect(out).toContain('compile built successfully');
    
    const afterStat = fs.statSync(OUT_FILE);
    expect(afterStat.mtimeMs).toBeGreaterThan(beforeStat.mtimeMs);
  });

  it('Cache Corruption: should detect corrupted JSON and rebuild', () => {
    // Break the JSON file
    fs.writeFileSync(GRAPH_FILE, '{ invalid_json: ');
    
    // minishake should detect "corrupted graph file, starting fresh" and recover.
    const out = runShk(['build', 'compile']);
    expect(out).toContain('compile built successfully');
  });
});
