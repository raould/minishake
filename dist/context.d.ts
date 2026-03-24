import type { PosixPath } from "./paths.js";
import type { NodeId } from "./graph.js";
import { BuildGraph } from "./graph.js";
import { LogWriter } from "./log.js";
interface RunResult {
    stdout: string;
    stderr: string;
}
export { RunResult };
export declare class BuildContext {
    graph: BuildGraph;
    nodeId: NodeId;
    projectRoot: string;
    logWriter: LogWriter;
    constructor(graph: BuildGraph, nodeId: NodeId, projectRoot: string, logWriter: LogWriter);
    run(tool: string, args: string[]): Promise<RunResult>;
    copy(src: PosixPath, dest: PosixPath): Promise<void>;
    readFile(p: PosixPath): Promise<string>;
    writeFile(p: PosixPath, data: string): Promise<void>;
    resolve(p: PosixPath): string;
    addDep(dep: any): void;
}
//# sourceMappingURL=context.d.ts.map