import { globSync } from "node:fs";
import { toPosix } from "./paths.js";
import { hashString, hashToolVersion } from "./hash.js";
import { probeEnvironment } from "./env.js";
import { BuildGraph, addEdge, ensureSourceNode } from "./graph.js";
export function buildGraphFromRules(rules, projectDir) {
    const graph = new BuildGraph();
    graph.env = probeEnvironment(projectDir);
    for (const rule of rules) {
        const ruleNodeId = ("rule:" + rule.name);
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
                const depId = ("file:" + dep.path);
                ensureSourceNode(graph, depId, dep.path);
                addEdge(graph, ruleNodeId, depId);
            }
            if ((dep.kind === "glob")) {
                const matches = globSync(dep.pattern, ({
                    cwd: projectDir
                }));
                for (const match of matches) {
                    const posixPath = toPosix(match, projectDir);
                    const depId = ("file:" + posixPath);
                    ensureSourceNode(graph, depId, posixPath);
                    addEdge(graph, ruleNodeId, depId);
                }
            }
            if ((dep.kind === "rule")) {
                const depId = ("rule:" + dep.name);
                addEdge(graph, ruleNodeId, depId);
            }
            if ((dep.kind === "env")) {
                const depId = ("env:" + dep.key);
                graph.nodes.set(depId, ({
                    id: depId,
                    kind: "source",
                    hash: hashString((process.env[dep.key] ?? "")),
                    lastBuilt: null
                }));
                addEdge(graph, ruleNodeId, depId);
            }
            if ((dep.kind === "tool")) {
                const depId = ("tool:" + dep.name);
                graph.nodes.set(depId, ({
                    id: depId,
                    kind: "source",
                    hash: hashToolVersion(dep.name),
                    lastBuilt: null
                }));
                addEdge(graph, ruleNodeId, depId);
            }
        }
    }
    return graph;
}
//# sourceMappingURL=rule.js.map