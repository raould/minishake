import { cpSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { toNative } from "./paths.js";
import { addEdge } from "./graph.js";
import { BuildError } from "./errors.js";
const execFileAsync = promisify(execFile);
export class BuildContext {
    graph;
    nodeId;
    projectRoot;
    logWriter;
    constructor(graph, nodeId, projectRoot, logWriter) {
        this.graph = graph;
        this.nodeId = nodeId;
        this.projectRoot = projectRoot;
        this.logWriter = logWriter;
    }
    async run(tool, args) {
        this.logWriter.write(({
            kind: "command-run",
            rule: this.nodeId,
            tool: tool,
            args: args,
            time: Date.now()
        }));
        const binDir = path.join(this.projectRoot, "node_modules", ".bin");
        const execEnv = Object.assign(({}), process.env, ({
            PATH: ((binDir + path.delimiter) + (process.env.PATH ?? ""))
        }));
        let result = null;
        try {
            result = (await execFileAsync(tool, args, ({
                cwd: this.projectRoot,
                env: execEnv
            })));
        }
        catch (e) {
            const err = e;
            throw new BuildError(this.nodeId, tool, (((err.stderr || err.stdout) || err.message) || "unknown error"));
        }
        return ({
            stdout: result.stdout,
            stderr: result.stderr
        });
    }
    async copy(src, dest) {
        this.logWriter.write(({
            kind: "file-copy",
            rule: this.nodeId,
            src: src,
            dest: dest,
            time: Date.now()
        }));
        cpSync(toNative(src, this.projectRoot), toNative(dest, this.projectRoot), ({
            recursive: true
        }));
    }
    async readFile(p) {
        this.logWriter.write(({
            kind: "file-read",
            rule: this.nodeId,
            path: p,
            time: Date.now()
        }));
        return (await readFile(toNative(p, this.projectRoot), "utf-8"));
    }
    async writeFile(p, data) {
        this.logWriter.write(({
            kind: "file-write",
            rule: this.nodeId,
            path: p,
            time: Date.now()
        }));
        (await writeFile(toNative(p, this.projectRoot), data));
    }
    resolve(p) {
        return toNative(p, this.projectRoot);
    }
    addDep(dep) {
        let depId = "unknown";
        if ((dep.kind === "file")) {
            depId = ("file:" + dep.path);
        }
        if ((dep.kind === "rule")) {
            depId = ("rule:" + dep.name);
        }
        if ((dep.kind === "env")) {
            depId = ("env:" + dep.key);
        }
        if ((dep.kind === "tool")) {
            depId = ("tool:" + dep.name);
        }
        addEdge(this.graph, this.nodeId, depId);
        this.logWriter.write(({
            kind: "dep-edge",
            from: this.nodeId,
            to: depId,
            time: Date.now()
        }));
    }
}
//# sourceMappingURL=context.js.map