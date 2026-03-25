#!/usr/bin/env node
import { rmSync, existsSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { buildGraphFromRules } from "./rule.js";
import { coreBuild, refreshAllSourceHashes } from "./build.js";
import { loadGraph } from "./persist.js";
import { loadBuildFile } from "./loader.js";
import { explainStaleness } from "./explain.js";
import { emitMermaid } from "./mermaid.js";
function findBuildFile(projectRoot) {
    if (existsSync(path.join(projectRoot, "build.shk"))) {
        return "build.shk";
    }
    if (existsSync(path.join(projectRoot, "build.ts"))) {
        return "build.ts";
    }
    if (existsSync(path.join(projectRoot, "build.js"))) {
        return "build.js";
    }
    throw new Error("no build file found (expected build.shk, build.ts, or build.js)");
}
export const build = async function (targetName, projectRoot, opts) {
    if ((!targetName)) {
        throw new Error("usage: shk build <target>");
    }
    const buildFile = (opts.file ?? findBuildFile(projectRoot));
    const rules = (await loadBuildFile(buildFile, projectRoot));
    const graph = buildGraphFromRules(rules, projectRoot);
    (await coreBuild(graph, targetName, projectRoot));
    console.log((("✓ " + targetName) + " built successfully"));
};
export const graph = async function (projectRoot, opts) {
    const prevGraphPath = path.join(projectRoot, ".shk/graph/build-graph.json");
    const prevGraph = loadGraph(prevGraphPath);
    if ((!prevGraph)) {
        throw new Error("no graph yet — run shk build first");
    }
    const outPath = path.join(projectRoot, ".shk/graph/last-run.mmd");
    emitMermaid(prevGraph, outPath);
    console.log(("graph written to " + outPath));
};
export const explain = async function (targetName, projectRoot, opts) {
    if ((!targetName)) {
        throw new Error("usage: shk explain <target>");
    }
    const buildFile = (opts.file ?? findBuildFile(projectRoot));
    const rules = (await loadBuildFile(buildFile, projectRoot));
    const currentGraph = buildGraphFromRules(rules, projectRoot);
    refreshAllSourceHashes(currentGraph, projectRoot);
    const prevGraphPath = path.join(projectRoot, ".shk/graph/build-graph.json");
    const prevGraph = loadGraph(prevGraphPath);
    explainStaleness(currentGraph, prevGraph, ("rule:" + targetName));
};
export const clean = async function (projectRoot, opts) {
    rmSync(path.join(projectRoot, ".shk"), ({
        recursive: true,
        force: true
    }));
    console.log("cleaned .shk/");
};
export const targets = async function (projectRoot, opts) {
    const buildFile = (opts.file ?? findBuildFile(projectRoot));
    const rules = (await loadBuildFile(buildFile, projectRoot));
    const graph = buildGraphFromRules(rules, projectRoot);
    console.log("Available targets:");
    for (const nodeId of graph.nodes.keys()) {
        if (nodeId.startsWith("rule:")) {
            const name = nodeId.substring(5);
            console.log(("  - " + name));
        }
    }
};
export const runCli = async function () {
    const prog = new Command();
    prog.name("shk");
    prog.description("MiniShake Build System\n\nBy default, shk looks for build.shk, build.ts, or build.js in the current directory.\nA target is a named rule or output that you want to produce.");
    prog.option("-f, --file <path>", "specify the build file to use");
    const buildCmd = prog.command("build [target]");
    buildCmd.description("Builds a specific target from the build graph.");
    buildCmd.action(async function (targetName) {
        const opts = prog.opts();
        const projectRoot = process.cwd();
        (await build(targetName, projectRoot, opts));
    });
    const graphCmd = prog.command("graph");
    graphCmd.description("Generates a mermaid diagram of the build graph from the last run.");
    graphCmd.action(async function () {
        const opts = prog.opts();
        const projectRoot = process.cwd();
        (await graph(projectRoot, opts));
    });
    const explainCmd = prog.command("explain [target]");
    explainCmd.description("Explains why a given target is stale and needs to be rebuilt.");
    explainCmd.action(async function (targetName) {
        const opts = prog.opts();
        const projectRoot = process.cwd();
        (await explain(targetName, projectRoot, opts));
    });
    const cleanCmd = prog.command("clean");
    cleanCmd.description("Cleans the build output by removing the .shk/ directory.");
    cleanCmd.action(async function () {
        const opts = prog.opts();
        const projectRoot = process.cwd();
        (await clean(projectRoot, opts));
    });
    const targetsCmd = prog.command("targets");
    targetsCmd.description("Lists all available targets defined in the build file.");
    targetsCmd.action(async function () {
        const opts = prog.opts();
        const projectRoot = process.cwd();
        (await targets(projectRoot, opts));
    });
    prog.showHelpAfterError(true);
    (await prog.parseAsync(process.argv));
};
const mainScript = process.argv.at(1);
if ((mainScript && mainScript.endsWith("shk.js"))) {
    runCli().catch(function (e) {
        console.error(e.message);
        process.exit(1);
    });
}
//# sourceMappingURL=shk.js.map