import { pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const dynamicImport = new Function("specifier", "return import(specifier)");
const __shkDirname = import.meta.dirname;
export class RuleCollector {
    rules = [];
    rule(def) {
        if (this.rules.some(function (r) {
            return (r.name === def.name);
        })) {
            throw new Error(("duplicate rule name: " + def.name));
        }
        if ((!def.output)) {
            throw new Error((("rule " + def.name) + " has no output"));
        }
        this.rules.push(def);
    }
}
function compileShkFile(shkPath, projectRoot) {
    const tsDir = path.join(projectRoot, ".shk", "build-file", "ts");
    const jsDir = path.join(projectRoot, ".shk", "build-file", "js");
    mkdirSync(tsDir, ({
        recursive: true
    }));
    mkdirSync(jsDir, ({
        recursive: true
    }));
    const shkRoot = __shkDirname;
    const shkNodeModules = path.resolve(shkRoot, "..", "node_modules");
    const shkBinDir = path.join(shkNodeModules, ".bin");
    const projBinDir = path.join(projectRoot, "node_modules", ".bin");
    const execEnv = Object.assign(({}), process.env, ({
        PATH: ((((shkBinDir + path.delimiter) + projBinDir) + path.delimiter) + (process.env.PATH ?? ""))
    }));
    let t2tcBin = path.join(shkBinDir, "t2tc");
    if ((!existsSync(t2tcBin))) {
        t2tcBin = path.join(projBinDir, "t2tc");
    }
    if ((!existsSync(t2tcBin))) {
        t2tcBin = "t2tc";
    }
    execFileSync(t2tcBin, [shkPath, "--outDir", tsDir, "--t2ext", "shk"], ({
        stdio: "pipe",
        env: execEnv
    }));
    const baseName = path.basename(shkPath).replace(new RegExp("\\.shk$"), "");
    const tsPath = path.join(tsDir, (baseName + ".ts"));
    let content = readFileSync(tsPath, "utf-8");
    content = content.replace(new RegExp("from \"(\\./[^\"]+)\\.t2\"", "g"), "from \"$1.js\"");
    content = content.replace(new RegExp("from \"(\\./[^\"]+)\\.shk\"", "g"), "from \"$1.js\"");
    writeFileSync(tsPath, content);
    const tsconfigPath = path.join(tsDir, "tsconfig.build-file.json");
    const typeRoots = [];
    const projTypes = path.join(projectRoot, "node_modules", "@types");
    if (existsSync(projTypes)) {
        typeRoots.push(projTypes);
    }
    const shkTypes = path.join(shkNodeModules, "@types");
    if (existsSync(shkTypes)) {
        typeRoots.push(shkTypes);
    }
    const tsconfig = JSON.stringify(({
        compilerOptions: ({
            module: "nodenext",
            target: "es2022",
            outDir: jsDir,
            rootDir: tsDir,
            strict: false,
            skipLibCheck: true,
            moduleDetection: "force",
            esModuleInterop: true,
            types: ["node"],
            typeRoots: typeRoots
        }),
        include: [path.join(tsDir, "*.ts")]
    }));
    writeFileSync(tsconfigPath, tsconfig);
    let tsc = path.join(projBinDir, "tsc");
    if ((!existsSync(tsc))) {
        tsc = path.join(shkBinDir, "tsc");
    }
    if ((!existsSync(tsc))) {
        tsc = "tsc";
    }
    execFileSync(tsc, ["--project", tsconfigPath], ({
        stdio: "pipe",
        env: execEnv
    }));
    return path.join(jsDir, (baseName + ".js"));
}
export const loadBuildFile = async function (filePath, projectRoot) {
    let importPath = "";
    if (filePath.endsWith(".shk")) {
        const absPath = path.resolve(projectRoot, filePath);
        const jsPath = compileShkFile(absPath, projectRoot);
        importPath = pathToFileURL(jsPath).toString();
    }
    else {
        const absPath = path.resolve(projectRoot, filePath);
        importPath = pathToFileURL(absPath).toString();
    }
    const mod = (await dynamicImport(importPath));
    const collector = new RuleCollector();
    if ((!mod.default)) {
        throw new Error((("build file " + filePath) + " must export a default function"));
    }
    (await mod.default(collector));
    return collector.rules;
};
//# sourceMappingURL=loader.js.map