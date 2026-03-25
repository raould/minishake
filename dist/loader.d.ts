import type { Rule } from "./rule.js";
export declare class RuleCollector {
    rules: Rule[];
    rule(def: Rule): void;
}
export declare const loadBuildFile: (filePath: string, projectRoot: string) => Promise<Rule[]>;
//# sourceMappingURL=loader.d.ts.map