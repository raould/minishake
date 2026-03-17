import { cpSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PosixPath } from "./paths.js";
import { toNative } from "./paths.js";
import type { NodeId, GraphNode } from "./graph.js";
import { BuildGraph, addEdge } from "./graph.js";
import type { LogEntry } from "./log.js";
import { LogWriter } from "./log.js";
import { BuildError } from "./errors.js";
const execFileAsync  = promisify(execFile);
interface RunResult  { stdout: string; stderr: string }
export { RunResult };
export class BuildContext {
  graph: BuildGraph;
  nodeId: NodeId;
  projectRoot: string;
  logWriter: LogWriter;
  constructor(graph: BuildGraph, nodeId: NodeId, projectRoot: string, logWriter: LogWriter) {
    this.graph = graph;
    this.nodeId = nodeId;
    this.projectRoot = projectRoot;
    this.logWriter = logWriter;
  }
  async run(tool: string, args: string[]): Promise<RunResult> {
    this.logWriter.write(({
      kind: "command-run",
      rule: this.nodeId,
      tool: tool,
      args: args,
      time: Date.now()
    }));
    let result: any = null;
    try {
      result = (await execFileAsync(tool, args, ({
        cwd: this.projectRoot
      })));
    }
    catch (e) {
      const err: any = e;
      throw new BuildError(this.nodeId, tool, (((err.stderr || err.stdout) || err.message) || "unknown error"));
    }
    return ({
      stdout: result.stdout,
      stderr: result.stderr
    });
  }
  async copy(src: PosixPath, dest: PosixPath): Promise<void> {
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
  async readFile(p: PosixPath): Promise<string> {
    this.logWriter.write(({
      kind: "file-read",
      rule: this.nodeId,
      path: p,
      time: Date.now()
    }));
    return (await readFile(toNative(p, this.projectRoot), "utf-8"));
  }
  async writeFile(p: PosixPath, data: string): Promise<void> {
    this.logWriter.write(({
      kind: "file-write",
      rule: this.nodeId,
      path: p,
      time: Date.now()
    }));
    (await writeFile(toNative(p, this.projectRoot), data));
  }
  resolve(p: PosixPath): string {
    return toNative(p, this.projectRoot);
  }
  addDep(dep: any): void {
    let depId: string = "unknown";
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
