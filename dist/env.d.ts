interface FsProbes {
    caseSensitive: boolean;
    unicodeNormalization: boolean;
    symlinkSupport: boolean;
}
interface OsInfo {
    platform: string;
    arch: string;
    release: string;
    endianness: string;
}
interface PathInfo {
    sep: string;
    delimiter: string;
}
interface NodeInfo {
    version: string;
    versions: Record<string, string>;
}
interface BuildEnvironment {
    fs: FsProbes;
    os: OsInfo;
    path: PathInfo;
    node: NodeInfo;
    ci: boolean;
    createdAt: string;
}
export { BuildEnvironment, FsProbes, OsInfo, PathInfo, NodeInfo };
export declare function probeEnvironment(projectDir: string): BuildEnvironment;
export declare function validateEnvironment(stored: BuildEnvironment, current: BuildEnvironment): void;
//# sourceMappingURL=env.d.ts.map