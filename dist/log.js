import { mkdirSync, openSync, appendFileSync, closeSync } from "node:fs";
import path from "node:path";
export class LogWriter {
    fd;
    filePath;
    constructor(projectRoot) {
        const timestamp = new Date().toISOString().replace(new RegExp("[:.\\-]", "g"), "");
        this.filePath = path.join(projectRoot, ".shk", "logs", (("run-" + timestamp) + ".jsonl"));
        mkdirSync(path.dirname(this.filePath), ({
            recursive: true
        }));
        this.fd = openSync(this.filePath, "a");
    }
    write(entry) {
        appendFileSync(this.fd, (JSON.stringify(entry) + "\n"));
    }
    close() {
        closeSync(this.fd);
    }
}
//# sourceMappingURL=log.js.map