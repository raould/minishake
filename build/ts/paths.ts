import path from "node:path";
type PosixPath  = string & { __brand: "PosixPath" };
export { PosixPath };
export function toPosix(raw: string, projectRoot: string): PosixPath {
  let rel: string = path.relative(projectRoot, path.resolve(projectRoot, raw));
  rel = rel.split(path.sep).join("/");
  rel = path.posix.normalize(rel);
  rel = rel.normalize("NFC");
  return rel as PosixPath;
}
export function toNative(p: PosixPath, projectRoot: string): string {
  return path.resolve(projectRoot, p);
}
