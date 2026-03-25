import { describe, it, expect } from 'vitest';
import { probeEnvironment, validateEnvironment } from '../dist/env.js';

describe('env', () => {
  it('probeEnvironment should gather environment details', () => {
    const env = probeEnvironment(process.cwd());
    expect(env).toBeDefined();
    expect(env.fs).toBeDefined();
    expect(env.os.platform).toBe(process.platform);
    expect(env.node.version).toBe(process.version);
  });

  it('validateEnvironment should not fail for identical environments', () => {
    const env = probeEnvironment(process.cwd());
    expect(() => validateEnvironment(env, env)).not.toThrow(); 
  });
});
