import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { NodeId, GraphNode } from "./graph.js";
import { BuildGraph } from "./graph.js";
function sanitize(id: string): string {
  return id.replace(new RegExp("[^a-zA-Z0-9_]", "g"), "_");
}
export function emitMermaid(graph: BuildGraph, outPath: string): void {
  const lines: string[] = ["graph LR"];
  graph.nodes.forEach(function(node: GraphNode, id: NodeId) {
    const label: string = (node.path ?? id);
    let shape: string = "";
    if ((node.kind === "source")) {
      shape = (("([" + label) + "])");
    }
    else {
      shape = (("[[" + label) + "]]");
    }
    lines.push((("  " + sanitize(id)) + shape));
  });
  graph.edges.forEach(function(tos: Set<NodeId>, from: NodeId) {
    for (const to of Array.from(tos)) {
      lines.push(((("  " + sanitize(from)) + " --> ") + sanitize(to)));
    }
  });
  mkdirSync(path.dirname(outPath), ({
    recursive: true
  }));
  writeFileSync(outPath, lines.join("\n"));
}
