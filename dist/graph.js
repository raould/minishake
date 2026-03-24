export class BuildGraph {
    env = null;
    nodes = new Map();
    edges = new Map();
    rules = new Map();
}
export function addEdge(graph, from, to) {
    if ((!graph.edges.has(from))) {
        graph.edges.set(from, new Set());
    }
    graph.edges.get(from).add(to);
}
export function ensureSourceNode(graph, id, nodePath) {
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
//# sourceMappingURL=graph.js.map