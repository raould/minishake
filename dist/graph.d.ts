import type { PosixPath } from "./paths.js";
import type { Hash } from "./hash.js";
import type { BuildEnvironment } from "./env.js";
type NodeId = string;
export { NodeId };
interface GraphNode {
    id: NodeId;
    kind: string;
    path?: PosixPath;
    hash: Hash | null;
    lastBuilt: number | null;
}
export { GraphNode };
export declare class BuildGraph {
    env: BuildEnvironment | null;
    nodes: Map<NodeId, GraphNode>;
    edges: Map<NodeId, Set<NodeId>>;
    rules: Map<string, any>;
}
export declare function addEdge(graph: BuildGraph, from: NodeId, to: NodeId): void;
export declare function ensureSourceNode(graph: BuildGraph, id: NodeId, nodePath: PosixPath): void;
//# sourceMappingURL=graph.d.ts.map