import type { PosixPath } from "./paths.js";
import type { Hash } from "./hash.js";
import type { BuildEnvironment } from "./env.js";
type NodeId  = string;
export { NodeId };
interface GraphNode  { id: NodeId; kind: string; path?: PosixPath; hash: Hash | null; lastBuilt: number | null }
export { GraphNode };
export class BuildGraph {
  env: BuildEnvironment | null = null;
  nodes: Map<NodeId, GraphNode> = new Map();
  edges: Map<NodeId, Set<NodeId>> = new Map();
  rules: Map<string, any> = new Map();
}
export function addEdge(graph: BuildGraph, from: NodeId, to: NodeId): void {
  if ((!graph.edges.has(from))) {
    graph.edges.set(from, new Set());
  }
  graph.edges.get(from).add(to);
}
export function ensureSourceNode(graph: BuildGraph, id: NodeId, nodePath: PosixPath): void {
  if ((!graph.nodes.has(id))) {
    graph.nodes.set(id, ({
      id: id,
      kind: "source",
      path: nodePath,
      hash: null,
      lastBuilt: null
    }));
  }
}
