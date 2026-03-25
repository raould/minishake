import { describe, it, expect } from 'vitest';
import { BuildError, CycleError, collectCyclePath } from '../dist/errors.js';

describe('errors', () => {
  it('BuildError', () => {
    const error = new BuildError('nodeId1', 'toolA', 'failed badly');
    expect(error.message).toBe('rule nodeId1 failed: toolA — failed badly');
    expect(error.name).toBe('BuildError');
    expect(error.nodeId).toBe('nodeId1');
    expect(error.tool).toBe('toolA');
    expect(error.detail).toBe('failed badly');
  });

  it('CycleError', () => {
    const error = new CycleError('cycle detected', ['a', 'b', 'c']);
    expect(error.message).toBe('cycle detected: a → b → c');
    expect(error.name).toBe('CycleError');
    expect(error.cyclePath).toEqual(['a', 'b', 'c']);
  });

  it('collectCyclePath', () => {
    const visiting = new Set(['x', 'y', 'z']);
    expect(collectCyclePath(visiting, 'y')).toEqual(['y', 'z', 'y']);
    expect(collectCyclePath(visiting, 'x')).toEqual(['x', 'y', 'z', 'x']);
  });
});
