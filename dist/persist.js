import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { BuildGraph } from "./graph.js";
const GRAPH_VERSION = 1;
export { GRAPH_VERSION };
export function saveGraph(graph, graphPath) {
    const nodesObj = ({});
    graph.nodes.forEach(function (node, id) {
        nodesObj[id] = ({
            kind: node.kind,
            path: node.path,
            hash: node.hash,
            lastBuilt: node.lastBuilt
        });
    });
    const edgesObj = ({});
    graph.edges.forEach(function (tos, from) {
        edgesObj[from] = Array.from(tos);
    });
    const data = ({
        version: GRAPH_VERSION,
        env: graph.env,
        nodes: nodesObj,
        edges: edgesObj
    });
    mkdirSync(path.dirname(graphPath), ({
        recursive: true
    }));
    const tmpPath = (graphPath + ".tmp");
    writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    renameSync(tmpPath, graphPath);
}
export function loadGraph(graphPath) {
    if ((!existsSync(graphPath))) {
        return null;
    }
    let data = null;
    try {
        data = JSON.parse(readFileSync(graphPath, "utf-8"));
    }
    catch (e) {
        const err = e;
        console.warn(("corrupted graph file, starting fresh: " + err.message));
        return null;
    }
    if ((data.version !== GRAPH_VERSION)) {
        console.warn((((("graph version mismatch (file: " + data.version) + ", expected: ") + GRAPH_VERSION) + ") — starting fresh"));
        return null;
    }
    const graph = new BuildGraph();
    graph.env = data.env;
    for (const entry of Object.entries(data.nodes)) {
        const id = entry[0];
        const nodeData = entry[1];
        graph.nodes.set(id, ({
            id: id,
            kind: nodeData.kind,
            path: nodeData.path,
            hash: nodeData.hash,
            lastBuilt: nodeData.lastBuilt
        }));
    }
    for (const entry of Object.entries(data.edges)) {
        const from = entry[0];
        const tos = entry[1];
        graph.edges.set(from, new Set(tos));
    }
    return graph;
}
//# sourceMappingURL=persist.js.map