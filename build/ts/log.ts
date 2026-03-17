import { mkdirSync, openSync, appendFileSync, closeSync } from "node:fs";
import path from "node:path";
import type { PosixPath } from "./paths.js";
import type { Hash } from "./hash.js";
type NodeId  = string;
export { NodeId };
interface LogEntry  { kind: string; time: number; rule?: string; path?: string; src?: string; dest?: string; tool?: string; args?: string[]; from?: string; to?: string; hash?: string; status?: string; key?: string; version?: string }
export { LogEntry };
export class LogWriter {
  fd: number;
  filePath: string;
  constructor(projectRoot: string) {
    const timestamp: string = new Date().toISOString().replace(new RegExp("[:.\\-]", "g"), "");
    this.filePath = path.join(projectRoot, ".shk", "logs", (("run-" + timestamp) + ".jsonl"));
    mkdirSync(path.dirname(this.filePath), ({
      recursive: true
    }));
    this.fd = openSync(this.filePath, "a");
  }
  write(entry: LogEntry) {
    appendFileSync(this.fd, (JSON.stringify(entry) + "\n"));
  }
  close() {
    closeSync(this.fd);
  }
}
