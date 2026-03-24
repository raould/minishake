type PosixPath = string & {
    __brand: "PosixPath";
};
export { PosixPath };
export declare function toPosix(raw: string, projectRoot: string): PosixPath;
export declare function toNative(p: PosixPath, projectRoot: string): string;
//# sourceMappingURL=paths.d.ts.map