import type { PosixPath } from "./paths.js";
import { toNative } from "./paths.js";
import type { Hash } from "./hash.js";
import { hashFileContents, hashString, hashToolVersion, hashBytes } from "./hash.js";
import type { NodeId, GraphNode } from "./graph.js";
import { BuildGraph } from "./graph.js";
import type { Rule } from "./rule.js";
import { LogWriter } from "./log.js";
import { BuildContext } from "./context.js";
import { saveGraph, loadGraph } from "./persist.js";
import { probeEnvironment, validateEnvironment } from "./env.js";
import { CycleError, collectCyclePath } from "./errors.js";
import { existsSync } from "node:fs";
export function refreshSourceHash(node: GraphNode, projectRoot: string): void {
  if (node.id.startsWith("file:")) {
    const filePath: string = node.id.slice(5);
    const nativePath: string = toNative(filePath as PosixPath, projectRoot);
    if ((!existsSync(nativePath))) {
      throw new Error(("source file not found: " + filePath));
    }
    node.hash = hashFileContents(nativePath);
  }
  if (node.id.startsWith("env:")) {
    const key: string = node.id.slice(4);
    node.hash = hashString((process.env[key] ?? ""));
  }
  if (node.id.startsWith("tool:")) {
    const name: string = node.id.slice(5);
    node.hash = hashToolVersion(name);
  }
}
export function refreshAllSourceHashes(graph: BuildGraph, projectRoot: string): void {
  graph.nodes.forEach(function(node: GraphNode) {
    if ((node.kind === "source")) {
      refreshSourceHash(node, projectRoot);
    }
  });
}
function computeInputHash(graph: BuildGraph, nodeId: NodeId): Hash {
  const deps  = (graph.edges.get(nodeId) ?? new Set());
  const sortedDeps  = Array.from(deps).sort();
  const parts: string[] = [];
  for (const depId of sortedDeps) {
    const depNode  = graph.nodes.get(depId);
    parts.push(depId);
    parts.push((depNode.hash ?? "null"));
  }
  const rule  = graph.rules.get(nodeId.replace("rule:", ""));
  if (rule) {
    parts.push(rule.output);
    parts.push(JSON.stringify(rule.deps));
  }
  return hashBytes(parts.join("\u0000"));
}
const doRebuild  = async function(graph: BuildGraph, prev: BuildGraph | null, nodeId: NodeId, visiting: Set<string>, visited: Set<string>, logWriter: LogWriter, projectRoot: string) {
  if (visited.has(nodeId)) {
    return;
  }
  if (visiting.has(nodeId)) {
    throw new CycleError("dependency cycle detected", collectCyclePath(visiting, nodeId));
  }
  visiting.add(nodeId);
  const node  = graph.nodes.get(nodeId);
  if ((node.kind === "source")) {
    refreshSourceHash(node, projectRoot);
    visiting.delete(nodeId);
    visited.add(nodeId);
    return;
  }
  const deps  = (graph.edges.get(nodeId) ?? new Set());
  for (const depId of Array.from(deps)) {
    (await doRebuild(graph, prev, depId, visiting, visited, logWriter, projectRoot));
  }
  const inputHash  = computeInputHash(graph, nodeId);
  let prevNode: any = null;
  if ((prev && prev.nodes.has(nodeId))) {
    prevNode = prev.nodes.get(nodeId);
  }
  if ((prevNode && (prevNode.hash === inputHash))) {
    node.hash = prevNode.hash;
    node.lastBuilt = prevNode.lastBuilt;
    logWriter.write(({
      kind: "cache-hit",
      rule: nodeId,
      hash: inputHash,
      time: Date.now()
    }));
    visiting.delete(nodeId);
    visited.add(nodeId);
    return;
  }
  const ruleName: string = nodeId.replace("rule:", "");
  const rule: any = graph.rules.get(ruleName);
  logWriter.write(({
    kind: "rule-start",
    rule: nodeId,
    time: Date.now()
  }));
  logWriter.write(({
    kind: "cache-miss",
    rule: nodeId,
    hash: inputHash,
    time: Date.now()
  }));
  const ctx  = new BuildContext(graph, nodeId, projectRoot, logWriter);
  try {
    (await rule.action(ctx));
    node.hash = inputHash;
    node.lastBuilt = Date.now();
    logWriter.write(({
      kind: "rule-end",
      rule: nodeId,
      time: Date.now(),
      status: "ok"
    }));
  }
  catch (e) {
    logWriter.write(({
      kind: "rule-end",
      rule: nodeId,
      time: Date.now(),
      status: "error"
    }));
    throw e;
  }
  visiting.delete(nodeId);
  visited.add(nodeId);
};
export const build = async function(graph: BuildGraph, targetName: string, projectRoot: string) {
  const targetId: NodeId = ("rule:" + targetName);
  if ((!graph.nodes.has(targetId))) {
    throw new Error(("unknown rule: " + targetName));
  }
  const graphPath: string = (projectRoot + "/.shk/graph/build-graph.json");
  const previousHashes  = loadGraph(graphPath);
  if (previousHashes) {
    const currentEnv  = probeEnvironment(projectRoot);
    validateEnvironment(previousHashes.env as any, currentEnv);
  }
  const logWriter  = new LogWriter(projectRoot);
  try {
    const visiting: Set<string> = new Set();
    const visited: Set<string> = new Set();
    (await doRebuild(graph, previousHashes, targetId, visiting, visited, logWriter, projectRoot));
  }
  finally {
    saveGraph(graph, graphPath);
    logWriter.close();
  }
};
