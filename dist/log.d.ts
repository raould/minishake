type NodeId = string;
export { NodeId };
interface LogEntry {
    kind: string;
    time: number;
    rule?: string;
    path?: string;
    src?: string;
    dest?: string;
    tool?: string;
    args?: string[];
    from?: string;
    to?: string;
    hash?: string;
    status?: string;
    key?: string;
    version?: string;
}
export { LogEntry };
export declare class LogWriter {
    fd: number;
    filePath: string;
    constructor(projectRoot: string);
    write(entry: LogEntry): void;
    close(): void;
}
//# sourceMappingURL=log.d.ts.map