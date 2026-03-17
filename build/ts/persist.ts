import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import type { NodeId, GraphNode } from "./graph.js";
import { BuildGraph } from "./graph.js";
const GRAPH_VERSION  = 1;
export { GRAPH_VERSION };
export function saveGraph(graph: BuildGraph, graphPath: string): void {
  const nodesObj: Record<string, any> = ({
    
  });
  graph.nodes.forEach(function(node: GraphNode, id: NodeId) {
    nodesObj[id] = ({
      kind: node.kind,
      path: node.path,
      hash: node.hash,
      lastBuilt: node.lastBuilt
    });
  });
  const edgesObj: Record<string, string[]> = ({
    
  });
  graph.edges.forEach(function(tos: Set<NodeId>, from: NodeId) {
    edgesObj[from] = Array.from(tos);
  });
  const data  = ({
    version: GRAPH_VERSION,
    env: graph.env,
    nodes: nodesObj,
    edges: edgesObj
  });
  mkdirSync(path.dirname(graphPath), ({
    recursive: true
  }));
  const tmpPath: string = (graphPath + ".tmp");
  writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  renameSync(tmpPath, graphPath);
}
export function loadGraph(graphPath: string): BuildGraph | null {
  if ((!existsSync(graphPath))) {
    return null;
  }
  let data: any = null;
  try {
    data = JSON.parse(readFileSync(graphPath, "utf-8"));
  }
  catch (e) {
    const err: Error = e as Error;
    console.warn(("corrupted graph file, starting fresh: " + err.message));
    return null;
  }
  if ((data.version !== GRAPH_VERSION)) {
    console.warn((((("graph version mismatch (file: " + data.version) + ", expected: ") + GRAPH_VERSION) + ") — starting fresh"));
    return null;
  }
  const graph  = new BuildGraph();
  graph.env = data.env;
  for (const entry of Object.entries(data.nodes)) {
    const id: string = entry[0];
    const nodeData: any = entry[1];
    graph.nodes.set(id, ({
      id: id,
      kind: nodeData.kind,
      path: nodeData.path,
      hash: nodeData.hash,
      lastBuilt: nodeData.lastBuilt
    }));
  }
  for (const entry of Object.entries(data.edges)) {
    const from: string = entry[0];
    const tos: any = entry[1];
    graph.edges.set(from, new Set(tos as string[]));
  }
  return graph;
}
