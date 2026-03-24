type Hash = string;
export { Hash };
export declare function hashBytes(data: string | Buffer): Hash;
export declare function hashFileContents(nativePath: string): Hash;
export declare function hashString(s: string): Hash;
export declare function hashToolVersion(name: string): Hash;
//# sourceMappingURL=hash.d.ts.map