import { BuildGraph } from "./graph.js";
declare const GRAPH_VERSION = 1;
export { GRAPH_VERSION };
export declare function saveGraph(graph: BuildGraph, graphPath: string): void;
export declare function loadGraph(graphPath: string): BuildGraph | null;
//# sourceMappingURL=persist.d.ts.map