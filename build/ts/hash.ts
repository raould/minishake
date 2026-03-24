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
  let versionOutput: string = "";
  let versionOk: boolean = false;
  try {
    const result: Buffer = execFileSync(bin, ["--version"], ({
      stdio: "pipe"
    }));
    versionOutput = result.toString("utf-8");
    versionOk = true;
  }
  catch (e) {
    versionOk = false;
  }
  if (versionOk) {
    return hashBytes(versionOutput);
  }
  if (existsSync(bin)) {
    return hashFileContents(bin);
  }
  throw new Error((("tool '" + name) + "' not found"));
}
