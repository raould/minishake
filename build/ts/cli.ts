import { rmSync } from "node:fs";
import path from "node:path";
import { BuildGraph } from "./graph.js";
import { buildGraphFromRules } from "./rule.js";
import { build, refreshAllSourceHashes } from "./build.js";
import { loadGraph } from "./persist.js";
import { loadBuildFile } from "./loader.js";
import { explainStaleness } from "./explain.js";
import { emitMermaid } from "./mermaid.js";
const main  = async function() {
  const args  = process.argv.slice(2);
  const command: string = (args[0] ?? "");
  const targetName: string = (args[1] ?? "");
  const projectRoot: string = process.cwd();
  if ((command === "build")) {
    if ((!targetName)) {
      console.error("usage: shk build <target>");
      process.exit(1);
    }
    let buildFile: string = "build.ts";
    const rules  = (await loadBuildFile(buildFile, projectRoot));
    const graph  = buildGraphFromRules(rules, projectRoot);
    (await build(graph, targetName, projectRoot));
    console.log((("✓ " + targetName) + " built successfully"));
  }
  if ((command === "graph")) {
    const prevGraph  = loadGraph(path.join(projectRoot, ".shk/graph/build-graph.json"));
    if ((!prevGraph)) {
      console.error("no graph yet — run shk build first");
      process.exit(1);
    }
    const outPath: string = path.join(projectRoot, ".shk/graph/last-run.mmd");
    emitMermaid(prevGraph, outPath);
    console.log(("graph written to " + outPath));
  }
  if ((command === "explain")) {
    if ((!targetName)) {
      console.error("usage: shk explain <target>");
      process.exit(1);
    }
    let buildFile: string = "build.ts";
    const rules  = (await loadBuildFile(buildFile, projectRoot));
    const currentGraph  = buildGraphFromRules(rules, projectRoot);
    refreshAllSourceHashes(currentGraph, projectRoot);
    const prevGraph  = loadGraph(path.join(projectRoot, ".shk/graph/build-graph.json"));
    explainStaleness(currentGraph, prevGraph, ("rule:" + targetName));
  }
  if ((command === "clean")) {
    rmSync(path.join(projectRoot, ".shk"), ({
      recursive: true,
      force: true
    }));
    console.log("cleaned .shk/");
  }
  if ((command === "")) {
    console.log("usage: shk <build|graph|explain|clean> [target]");
    process.exit(1);
  }
};
main().catch(function(e: any) {
  console.error(e.message);
  process.exit(1);
});
