import { describe, it, expect } from 'vitest';
import { buildGraphFromRules } from '../dist/rule.js';
import type { Rule } from '../dist/rule.js';

describe('rule', () => {
  it('buildGraphFromRules should convert rules to a BuildGraph with proper edges', () => {
    const rules: Rule[] = [
      {
        name: 'test-rule',
        output: 'out.txt' as any,
        deps: [
          { kind: 'file', path: 'src/main.ts' as any },
          { kind: 'env', key: 'TEST_ENV_VAR' }
        ],
        action: async () => {}
      }
    ];

    process.env.TEST_ENV_VAR = 'hello';
    const graph = buildGraphFromRules(rules, process.cwd());

    expect(graph.rules.has('test-rule')).toBe(true);
    expect(graph.nodes.has('rule:test-rule')).toBe(true);
    
    // Check file dep
    expect(graph.nodes.has('file:src/main.ts')).toBe(true);
    expect(graph.edges.get('rule:test-rule')?.has('file:src/main.ts')).toBe(true);
    
    // Check env dep
    expect(graph.nodes.has('env:TEST_ENV_VAR')).toBe(true);
    expect(graph.edges.get('rule:test-rule')?.has('env:TEST_ENV_VAR')).toBe(true);
  });
});
