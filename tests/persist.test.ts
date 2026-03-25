import { describe, it, expect } from 'vitest';
import { saveGraph, loadGraph, GRAPH_VERSION } from '../dist/persist.js';
import { BuildGraph } from '../dist/graph.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('persist', () => {
  it('should save and load graph', () => {
    const p = path.join(process.cwd(), 'tests', 'temp-graph.json');
    const g = new BuildGraph();
    g.nodes.set('a', { id: 'a', kind: 'file', hash: '123', lastBuilt: 0 });
    g.edges.set('a', new Set());
    
    saveGraph(g, p);
    expect(fs.existsSync(p)).toBe(true);

    const loaded = loadGraph(p);
    expect(loaded).toBeDefined();
    expect(loaded?.nodes.has('a')).toBe(true);
    expect(loaded?.nodes.get('a')?.hash).toBe('123');

    fs.unlinkSync(p);
  });

  it('should return null when loading missing graph', () => {
    const p = path.join(process.cwd(), 'tests', 'missing-graph.json');
    const loaded = loadGraph(p);
    expect(loaded).toBeNull();
  });
});
