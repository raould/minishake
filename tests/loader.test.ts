import { describe, it, expect } from 'vitest';
import { RuleCollector } from '../dist/loader.js';
import path from 'node:path';

describe('RuleCollector', () => {
  it('should collect rules', () => {
    const collector = new RuleCollector();
    collector.rule({ name: 'rule1', output: 'out1', deps: [] });
    collector.rule({ name: 'rule2', output: 'out2', deps: [] });
    expect(collector.rules.length).toBe(2);
    expect(collector.rules[0].name).toBe('rule1');
  });

  it('should throw on duplicate rule name', () => {
    const collector = new RuleCollector();
    collector.rule({ name: 'rule1', output: 'out1', deps: [] });
    expect(() => {
      collector.rule({ name: 'rule1', output: 'out2', deps: [] });
    }).toThrow('duplicate rule name: rule1');
  });

  it('should throw if no output', () => {
    const collector = new RuleCollector();
    expect(() => {
      collector.rule({ name: 'rule1', deps: [] } as any);
    }).toThrow('rule rule1 has no output');
  });
});
