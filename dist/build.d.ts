import type { GraphNode } from "./graph.js";
import { BuildGraph } from "./graph.js";
export declare function refreshSourceHash(node: GraphNode, projectRoot: string): void;
export declare function refreshAllSourceHashes(graph: BuildGraph, projectRoot: string): void;
export declare const coreBuild: (graph: BuildGraph, targetName: string, projectRoot: string) => Promise<void>;
//# sourceMappingURL=build.d.ts.map