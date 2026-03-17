import type { NodeId, GraphNode } from "./graph.js";
import { BuildGraph } from "./graph.js";
import { refreshSourceHash } from "./build.js";
export function explainStaleness(currentGraph: BuildGraph, prevGraph: BuildGraph | null, nodeId: NodeId): void {
  const node  = currentGraph.nodes.get(nodeId);
  if ((!node)) {
    console.log(("ERROR: unknown node " + nodeId));
    return;
  }
  if ((!prevGraph)) {
    console.log((nodeId + " — never built (no previous graph)"));
    return;
  }
  const prev  = prevGraph.nodes.get(nodeId);
  if ((!prev)) {
    console.log((nodeId + " — never built (new rule)"));
    return;
  }
  const currentDeps  = (currentGraph.edges.get(nodeId) ?? new Set());
  const prevDeps  = (prevGraph.edges.get(nodeId) ?? new Set());
  let changed: number = 0;
  for (const d of Array.from(currentDeps)) {
    if ((!prevDeps.has(d))) {
      console.log(("  ADDED dep: " + d));
      changed = (changed + 1);
    }
  }
  for (const d of Array.from(prevDeps)) {
    if ((!currentDeps.has(d))) {
      console.log(("  REMOVED dep: " + d));
      changed = (changed + 1);
    }
  }
  for (const depId of Array.from(currentDeps)) {
    const depNode  = currentGraph.nodes.get(depId);
    const prevDepNode  = prevGraph.nodes.get(depId);
    if ((!prevDepNode)) {
      console.log(("  NEW: " + depId));
      changed = (changed + 1);
    }
    else {
      if ((depNode.hash !== prevDepNode.hash)) {
        console.log(("  CHANGED: " + depId));
        console.log(("    was: " + prevDepNode.hash));
        console.log(("    now: " + depNode.hash));
        changed = (changed + 1);
      }
    }
  }
  if (((changed === 0) && (currentDeps.size === prevDeps.size))) {
    console.log((((nodeId + " — CURRENT (all ") + currentDeps.size) + " deps unchanged)"));
  }
  else {
    console.log((((("  (" + changed) + " of ") + currentDeps.size) + " deps changed)"));
  }
}
