import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
export function hashBytes(data) {
    const h = createHash("sha256");
    h.update(data);
    return h.digest("hex");
}
export function hashFileContents(nativePath) {
    const contents = readFileSync(nativePath);
    return hashBytes(contents);
}
export function hashString(s) {
    return hashBytes(s);
}
export function hashToolVersion(name) {
    let bin = name;
    const localBin = path.join(process.cwd(), "node_modules", ".bin", name);
    if (existsSync(localBin)) {
        bin = localBin;
    }
    let versionOutput = "";
    let versionOk = false;
    try {
        const result = execFileSync(bin, ["--version"], ({
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
//# sourceMappingURL=hash.js.map