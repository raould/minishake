import { describe, it, expect, vi } from 'vitest';
import { explainStaleness } from '../dist/explain.js';
import { BuildGraph } from '../dist/graph.js';

describe('explainStaleness', () => {
  it('should explain why a node is stale', () => {
    const cg = new BuildGraph();
    cg.nodes.set('node', { id: 'node', kind: 'rule', hash: null, lastBuilt: 0 });
    cg.nodes.set('dep1', { id: 'dep1', kind: 'source', hash: 'newHash', lastBuilt: null });
    cg.edges.set('node', new Set(['dep1']));

    const pg = new BuildGraph();
    pg.nodes.set('node', { id: 'node', kind: 'rule', hash: null, lastBuilt: 0 });
    pg.nodes.set('dep1', { id: 'dep1', kind: 'source', hash: 'oldHash', lastBuilt: null });
    pg.edges.set('node', new Set(['dep1']));
    
    // spy on console.log
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    explainStaleness(cg, pg, 'node');
    
    expect(logSpy).toHaveBeenCalledWith('  CHANGED: dep1');
    expect(logSpy).toHaveBeenCalledWith('    was: oldHash');
    expect(logSpy).toHaveBeenCalledWith('    now: newHash');
    
    logSpy.mockRestore();
  });
});
