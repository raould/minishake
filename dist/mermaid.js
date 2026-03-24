import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
function sanitize(id) {
    return id.replace(new RegExp("[^a-zA-Z0-9_]", "g"), "_");
}
export function emitMermaid(graph, outPath) {
    const lines = ["graph LR"];
    graph.nodes.forEach(function (node, id) {
        const label = (node.path ?? id);
        let shape = "";
        if ((node.kind === "source")) {
            shape = (("([" + label) + "])");
        }
        else {
            shape = (("[[" + label) + "]]");
        }
        lines.push((("  " + sanitize(id)) + shape));
    });
    graph.edges.forEach(function (tos, from) {
        for (const to of Array.from(tos)) {
            lines.push(((("  " + sanitize(from)) + " --> ") + sanitize(to)));
        }
    });
    mkdirSync(path.dirname(outPath), ({
        recursive: true
    }));
    writeFileSync(outPath, lines.join("\n"));
}
//# sourceMappingURL=mermaid.js.map