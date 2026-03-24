import path from "node:path";
export function toPosix(raw, projectRoot) {
    let rel = path.relative(projectRoot, path.resolve(projectRoot, raw));
    rel = rel.split(path.sep).join("/");
    rel = path.posix.normalize(rel);
    rel = rel.normalize("NFC");
    return rel;
}
export function toNative(p, projectRoot) {
    return path.resolve(projectRoot, p);
}
//# sourceMappingURL=paths.js.map