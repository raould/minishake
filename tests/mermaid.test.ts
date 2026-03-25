import { describe, it, expect } from 'vitest';
import { emitMermaid } from '../dist/mermaid.js';
import { BuildGraph } from '../dist/graph.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('mermaid', () => {
  it('should emit a valid mermaid diagram', () => {
    const p = path.join(process.cwd(), 'tests', 'test-mermaid.mmd');
    const g = new BuildGraph();
    g.nodes.set('src', { id: 'src', kind: 'source', path: 'src.js' as any, hash: '123', lastBuilt: null });
    g.nodes.set('rule', { id: 'rule', kind: 'rule', path: 'out.js' as any, hash: null, lastBuilt: 123 });
    g.edges.set('rule', new Set(['src']));
    
    emitMermaid(g, p);
    expect(fs.existsSync(p)).toBe(true);
    
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('graph LR');
    expect(content).toContain('src([src.js])');
    expect(content).toContain('rule[[out.js]]');
    expect(content).toContain('rule --> src');
    
    fs.unlinkSync(p);
  });
});
