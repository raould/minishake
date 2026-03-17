import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
type Hash  = string;
export { Hash };
export function hashBytes(data: string | Buffer): Hash {
  const h  = createHash("sha256");
  h.update(data);
  return h.digest("hex");
}
export function hashFileContents(nativePath: string): Hash {
  const contents  = readFileSync(nativePath);
  return hashBytes(contents);
}
export function hashString(s: string): Hash {
  return hashBytes(s);
}
export function hashToolVersion(name: string): Hash {
  let bin: string = name;
  const localBin: string = path.join(process.cwd(), "node_modules", ".bin", name);
  if (existsSync(localBin)) {
    bin = localBin;
  }
  let result: Buffer = Buffer.from("");
  try {
    result = execFileSync(bin, ["--version"]);
  }
  catch (e) {
    throw new Error((("tool '" + name) + "' not found or --version failed"));
  }
  return hashBytes(result.toString("utf-8"));
}
