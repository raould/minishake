import type { PosixPath } from "./paths.js";
import { BuildGraph } from "./graph.js";
interface Dep {
    kind: string;
    path?: PosixPath;
    pattern?: string;
    name?: string;
    key?: string;
}
export { Dep };
interface Rule {
    name: string;
    output: PosixPath;
    deps: Dep[];
    action: (ctx: any) => Promise<void>;
}
export { Rule };
export declare function buildGraphFromRules(rules: Rule[], projectDir: string): BuildGraph;
//# sourceMappingURL=rule.d.ts.map