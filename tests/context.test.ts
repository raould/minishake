import { describe, it, expect, vi } from 'vitest';
import { BuildContext } from '../dist/context.js';
import { BuildGraph } from '../dist/graph.js';
import path from 'node:path';

describe('BuildContext', () => {
  it('should initialize and resolve paths', () => {
    const graph = new BuildGraph();
    const logWriter = { write: vi.fn(), close: vi.fn(), fd: 0 };
    const ctx = new BuildContext(graph, 'node1', '/root', logWriter);
    
    expect(ctx.nodeId).toBe('node1');
    expect(ctx.resolve('some/path' as any)).toBe(path.resolve('/root', 'some/path'));
  });

  it('should record deps correctly', () => {
    const graph = new BuildGraph();
    graph.nodes.set('node1', { id: 'node1', kind: 'rule', hash: null, lastBuilt: 0 });
    graph.nodes.set('file:foo', { id: 'file:foo', kind: 'source', hash: null, lastBuilt: 0 });
    const logWriter = { write: vi.fn(), close: vi.fn(), fd: 0 };
    const ctx = new BuildContext(graph, 'node1', '/root', logWriter);
    
    ctx.addDep({ kind: 'file', path: 'foo' });
    expect(graph.edges.get('node1')?.has('file:foo')).toBe(true);
    expect(logWriter.write).toHaveBeenCalledWith(expect.objectContaining({ kind: 'dep-edge', from: 'node1', to: 'file:foo' }));
  });
});
