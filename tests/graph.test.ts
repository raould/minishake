import { describe, it, expect } from 'vitest';
import { BuildGraph, addEdge, ensureSourceNode } from '../dist/graph.js';
import type { PosixPath } from '../dist/paths.js';

describe('graph', () => {
  it('should create an empty graph', () => {
    const g = new BuildGraph();
    expect(g.nodes.size).toBe(0);
    expect(g.edges.size).toBe(0);
  });

  it('addEdge should add connections', () => {
    const g = new BuildGraph();
    addEdge(g, 'A', 'B');
    expect(g.edges.has('A')).toBe(true);
    expect(g.edges.get('A')?.has('B')).toBe(true);
    
    addEdge(g, 'A', 'C');
    expect(g.edges.get('A')?.has('C')).toBe(true);
  });

  it('ensureSourceNode should add missing node with correct properties', () => {
    const g = new BuildGraph();
    ensureSourceNode(g, 'srcNode', 'src/file.ts' as PosixPath);
    expect(g.nodes.has('srcNode')).toBe(true);
    
    const node = g.nodes.get('srcNode');
    expect(node).toBeDefined();
    expect(node?.id).toBe('srcNode');
    expect(node?.kind).toBe('source');
    expect(node?.path).toBe('src/file.ts');
    expect(node?.hash).toBe(null);
  });
});
