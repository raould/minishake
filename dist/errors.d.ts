export declare class BuildError extends Error {
    nodeId: string;
    tool: string;
    detail: string;
    constructor(nodeId: string, tool: string, detail: string);
}
export declare class CycleError extends Error {
    cyclePath: string[];
    constructor(message: string, cyclePath: string[]);
}
export declare function collectCyclePath(visiting: Set<string>, nodeId: string): string[];
//# sourceMappingURL=errors.d.ts.map