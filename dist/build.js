import { toNative } from "./paths.js";
import { hashFileContents, hashString, hashToolVersion, hashBytes } from "./hash.js";
import { LogWriter } from "./log.js";
import { BuildContext } from "./context.js";
import { saveGraph, loadGraph } from "./persist.js";
import { probeEnvironment, validateEnvironment } from "./env.js";
import { CycleError, collectCyclePath } from "./errors.js";
import { existsSync } from "node:fs";
export function refreshSourceHash(node, projectRoot) {
    if (node.id.startsWith("file:")) {
        const filePath = node.id.slice(5);
        const nativePath = toNative(filePath, projectRoot);
        if ((!existsSync(nativePath))) {
            throw new Error(("source file not found: " + filePath));
        }
        node.hash = hashFileContents(nativePath);
    }
    if (node.id.startsWith("env:")) {
        const key = node.id.slice(4);
        node.hash = hashString((process.env[key] ?? ""));
    }
    if (node.id.startsWith("tool:")) {
        const name = node.id.slice(5);
        node.hash = hashToolVersion(name);
    }
}
export function refreshAllSourceHashes(graph, projectRoot) {
    graph.nodes.forEach(function (node) {
        if ((node.kind === "source")) {
            refreshSourceHash(node, projectRoot);
        }
    });
}
function computeInputHash(graph, nodeId) {
    const deps = (graph.edges.get(nodeId) ?? new Set());
    const sortedDeps = Array.from(deps).sort();
    const parts = [];
    for (const depId of sortedDeps) {
        const depNode = graph.nodes.get(depId);
        parts.push(depId);
        parts.push((depNode.hash ?? "null"));
    }
    const rule = graph.rules.get(nodeId.replace("rule:", ""));
    if (rule) {
        parts.push(rule.output);
        parts.push(JSON.stringify(rule.deps));
    }
    return hashBytes(parts.join("\u0000"));
}
const doRebuild = async function (graph, prev, nodeId, visiting, visited, logWriter, projectRoot) {
    if (visited.has(nodeId)) {
        return;
    }
    if (visiting.has(nodeId)) {
        throw new CycleError("dependency cycle detected", collectCyclePath(visiting, nodeId));
    }
    visiting.add(nodeId);
    const node = graph.nodes.get(nodeId);
    if ((node.kind === "source")) {
        refreshSourceHash(node, projectRoot);
        visiting.delete(nodeId);
        visited.add(nodeId);
        return;
    }
    const deps = (graph.edges.get(nodeId) ?? new Set());
    for (const depId of Array.from(deps)) {
        (await doRebuild(graph, prev, depId, visiting, visited, logWriter, projectRoot));
    }
    const inputHash = computeInputHash(graph, nodeId);
    let prevNode = null;
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
    const ruleName = nodeId.replace("rule:", "");
    const rule = graph.rules.get(ruleName);
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
    const ctx = new BuildContext(graph, nodeId, projectRoot, logWriter);
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
export const coreBuild = async function (graph, targetName, projectRoot) {
    const targetId = ("rule:" + targetName);
    if ((!graph.nodes.has(targetId))) {
        throw new Error(("unknown rule: " + targetName));
    }
    const graphPath = (projectRoot + "/.shk/graph/build-graph.json");
    const previousHashes = loadGraph(graphPath);
    if (previousHashes) {
        const currentEnv = probeEnvironment(projectRoot);
        validateEnvironment(previousHashes.env, currentEnv);
    }
    const logWriter = new LogWriter(projectRoot);
    try {
        const visiting = new Set();
        const visited = new Set();
        (await doRebuild(graph, previousHashes, targetId, visiting, visited, logWriter, projectRoot));
    }
    finally {
        saveGraph(graph, graphPath);
        logWriter.close();
    }
};
//# sourceMappingURL=build.js.map