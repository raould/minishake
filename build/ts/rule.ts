import { globSync } from "node:fs";
import type { PosixPath } from "./paths.js";
import { toPosix } from "./paths.js";
import type { Hash } from "./hash.js";
import { hashFileContents, hashString, hashToolVersion } from "./hash.js";
import type { BuildEnvironment } from "./env.js";
import { probeEnvironment } from "./env.js";
import type { NodeId, GraphNode } from "./graph.js";
import { BuildGraph, addEdge, ensureSourceNode } from "./graph.js";
interface Dep  { kind: string; path?: PosixPath; pattern?: string; name?: string; key?: string }
export { Dep };
interface Rule  { name: string; output: PosixPath; deps: Dep[]; action: (ctx: any) => Promise<void> }
export { Rule };
export function buildGraphFromRules(rules: Rule[], projectDir: string): BuildGraph {
  const graph  = new BuildGraph();
  graph.env = probeEnvironment(projectDir);
  for (const rule of rules) {
    const ruleNodeId: NodeId = ("rule:" + rule.name);
    graph.nodes.set(ruleNodeId, ({
      id: ruleNodeId,
      kind: "rule",
      path: rule.output,
      hash: null,
      lastBuilt: null
    }));
    graph.rules.set(rule.name, rule);
    for (const dep of rule.deps) {
      if ((dep.kind === "file")) {
        const depId: NodeId = ("file:" + dep.path);
        ensureSourceNode(graph, depId, dep.path as PosixPath);
        addEdge(graph, ruleNodeId, depId);
      }
      if ((dep.kind === "glob")) {
        const matches  = globSync(dep.pattern as string, ({
          cwd: projectDir
        }));
        for (const match of matches) {
          const posixPath  = toPosix(match as string, projectDir);
          const depId: NodeId = ("file:" + posixPath);
          ensureSourceNode(graph, depId, posixPath);
          addEdge(graph, ruleNodeId, depId);
        }
      }
      if ((dep.kind === "rule")) {
        const depId: NodeId = ("rule:" + dep.name);
        addEdge(graph, ruleNodeId, depId);
      }
      if ((dep.kind === "env")) {
        const depId: NodeId = ("env:" + dep.key);
        graph.nodes.set(depId, ({
          id: depId,
          kind: "source",
          hash: hashString((process.env[dep.key as string] ?? "")),
          lastBuilt: null
        }));
        addEdge(graph, ruleNodeId, depId);
      }
      if ((dep.kind === "tool")) {
        const depId: NodeId = ("tool:" + dep.name);
        graph.nodes.set(depId, ({
          id: depId,
          kind: "source",
          hash: hashToolVersion(dep.name as string),
          lastBuilt: null
        }));
        addEdge(graph, ruleNodeId, depId);
      }
    }
  }
  return graph;
}
