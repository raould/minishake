export class BuildError extends Error {
    nodeId;
    tool;
    detail;
    constructor(nodeId, tool, detail) {
        super(((((("rule " + nodeId) + " failed: ") + tool) + " — ") + detail));
        this.name = "BuildError";
        this.nodeId = nodeId;
        this.tool = tool;
        this.detail = detail;
    }
}
export class CycleError extends Error {
    cyclePath;
    constructor(message, cyclePath) {
        super(((message + ": ") + cyclePath.join(" → ")));
        this.name = "CycleError";
        this.cyclePath = cyclePath;
    }
}
export function collectCyclePath(visiting, nodeId) {
    const result = [];
    let found = false;
    visiting.forEach(function (id) {
        if ((found || (id === nodeId))) {
            found = true;
            result.push(id);
        }
    });
    result.push(nodeId);
    return result;
}
//# sourceMappingURL=errors.js.map