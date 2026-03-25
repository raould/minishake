license: public domain CC0

# MiniShake MVP Implementation Sketch

High-level pseudocode for the core build graph engine. No level-2 caching
(content-addressed artifact store). The graph itself — nodes, edges, hashes,
staleness — is the only persistence layer.

---

## 1. Data Model

```typescript
// ── Paths ────────────────────────────────────
// All paths in the graph are POSIX-style, project-relative, forward-slash.
// Conversion to native absolute paths happens at the I/O boundary only.

type PosixPath = string & { __brand: "PosixPath" };

function toPosix(raw: string, projectRoot: string): PosixPath {
  // 1. make relative to project root
  let rel = path.relative(projectRoot, path.resolve(projectRoot, raw));
  // 2. normalize separators to forward slash
  rel = rel.split(path.sep).join("/");
  // 3. collapse .. and . segments
  rel = path.posix.normalize(rel);
  // 4. unicode NFC normalization (for macOS HFS+/APFS)
  rel = rel.normalize("NFC");
  return rel as PosixPath;
}

function toNative(p: PosixPath, projectRoot: string): string {
  return path.resolve(projectRoot, p);
}

// ── Build Environment ────────────────────────
// Snapshot of the environment at graph creation time.
// Persisted in the graph file. Checked on every subsequent load.

interface BuildEnvironment {
  // filesystem probes (run once at graph creation, in the project directory)
  fs: {
    caseSensitive:        boolean;   // temp file probe
    unicodeNormalization: boolean;   // NFC/NFD probe
    symlinkSupport:       boolean;   // symlink probe
  };
  // OS (from node built-ins, zero deps)
  os: {
    platform:  string;    // process.platform — "linux", "darwin", "win32"
    arch:      string;    // process.arch — "x64", "arm64"
    release:   string;    // os.release()
    endianness: string;   // os.endianness()
  };
  // paths
  path: {
    sep:       string;    // path.sep — "/" or "\\"
    delimiter: string;    // path.delimiter — ":" or ";"
  };
  // node runtime
  node: {
    version:   string;    // process.version
    versions:  Record<string, string>;  // process.versions (v8, openssl, icu, etc.)
  };
  // informational
  ci:          boolean;   // !!process.env.CI
  createdAt:   string;    // ISO timestamp
}

// ── Nodes ────────────────────────────────────

type NodeId = string;       // e.g. "file:src/index.ts", "rule:bundle"
type Hash   = string;       // hex sha256

interface GraphNode {
  id:         NodeId;
  kind:       "source" | "rule";
  path?:      PosixPath;    // project-relative POSIX path
  hash:       Hash | null;  // content hash; null = never built / unknown
  lastBuilt:  number | null; // epoch ms
}

// ── Edges ────────────────────────────────────
// edge: dependent → dependency  ("to build Y, I need X")

interface GraphEdge {
  from: NodeId;   // the node that needs something
  to:   NodeId;   // the node it needs
}

// ── Rules ────────────────────────────────────
// A rule is the user-authored definition. It declares an output (the goal),
// its dependencies (inputs / other rules), and an action to produce the output.

interface Rule {
  name:    string;                    // unique identifier
  output:  PosixPath;                 // the artifact this rule produces
  deps:    Dep[];                     // what this rule needs before it can run
  action:  (ctx: BuildContext) => Promise<void>;  // how to produce the output
}

type Dep =
  | { kind: "file";  path: PosixPath }   // a source file
  | { kind: "glob";  pattern: string }    // expanded at graph-build time
  | { kind: "rule";  name: string }       // another rule's output
  | { kind: "env";   key: string }        // an environment variable
  | { kind: "tool";  name: string }       // a toolchain binary (tsc, esbuild, node)
  ;

// ── The Graph ────────────────────────────────

interface BuildGraph {
  env:   BuildEnvironment;                // snapshot from creation time
  nodes: Map<NodeId, GraphNode>;
  edges: Map<NodeId, Set<NodeId>>;        // from → set of dependencies
  rules: Map<string, Rule>;               // rule name → definition
}
```

---

## 2. Environment Probing and Validation

```
function probeEnvironment(projectDir: string): BuildEnvironment
  return {
    fs: {
      caseSensitive:        probeCaseSensitivity(projectDir),
      unicodeNormalization: probeUnicodeNormalization(projectDir),
      symlinkSupport:       probeSymlinks(projectDir),
    },
    os: {
      platform:   process.platform,
      arch:       process.arch,
      release:    os.release(),
      endianness: os.endianness(),
    },
    path: {
      sep:       path.sep,
      delimiter: path.delimiter,
    },
    node: {
      version:  process.version,
      versions: { ...process.versions },
    },
    ci:        !!process.env.CI,
    createdAt: new Date().toISOString(),
  }


function probeCaseSensitivity(dir: string): boolean
  // same technique used by TypeScript, Jest, Vite
  probe = path.join(dir, `_shk_case_${process.pid}`)
  try:
    writeFileSync(probe, "")
    exists = existsSync(probe.toUpperCase())
    return !exists    // if uppercase doesn't exist → case-sensitive
  finally:
    unlinkSync(probe)


function probeUnicodeNormalization(dir: string): boolean
  // NFC (single codepoint) vs NFD (decomposed) — macOS HFS+/APFS normalizes
  nfcPath = path.join(dir, `_shk_\u00e9_${process.pid}`)   // é as NFC
  nfdPath = path.join(dir, `_shk_e\u0301_${process.pid}`)   // e + combining acute
  try:
    writeFileSync(nfcPath, "")
    return existsSync(nfdPath)  // true = FS normalizes unicode
  finally:
    unlinkSync(nfcPath)


function probeSymlinks(dir: string): boolean
  target = path.join(dir, `_shk_symtgt_${process.pid}`)
  link   = path.join(dir, `_shk_symlink_${process.pid}`)
  try:
    writeFileSync(target, "")
    symlinkSync(target, link)
    return true
  catch:
    return false    // Windows without Developer Mode, or restricted FS
  finally:
    try unlinkSync(link)
    try unlinkSync(target)


// ── Validation on graph load ─────────────────
// Called every time a persisted graph is loaded. Compares stored env
// against current env. Halts on incompatible changes, warns on others.

function validateEnvironment(stored: BuildEnvironment, current: BuildEnvironment): void
  // Hard incompatibilities — halt the build
  fatal = []

  if stored.fs.caseSensitive != current.fs.caseSensitive:
    fatal.push("filesystem case sensitivity changed: "
      + stored.fs.caseSensitive + " → " + current.fs.caseSensitive)

  if stored.fs.unicodeNormalization != current.fs.unicodeNormalization:
    fatal.push("filesystem unicode normalization changed: "
      + stored.fs.unicodeNormalization + " → " + current.fs.unicodeNormalization)

  if stored.os.platform != current.os.platform:
    fatal.push("OS platform changed: "
      + stored.os.platform + " → " + current.os.platform)

  if fatal.length > 0:
    error("BUILD HALTED — persisted graph is incompatible with current environment:")
    for each msg in fatal: error("  " + msg)
    error("Run `shk clean` to discard the graph and rebuild from scratch.")
    exit(1)

  // Soft incompatibilities — warn but continue
  if stored.os.arch != current.os.arch:
    warn("architecture changed: " + stored.os.arch + " → " + current.os.arch)

  if major(stored.node.version) != major(current.node.version):
    warn("Node.js major version changed: "
      + stored.node.version + " → " + current.node.version)

  if stored.fs.symlinkSupport != current.fs.symlinkSupport:
    warn("symlink support changed: "
      + stored.fs.symlinkSupport + " → " + current.fs.symlinkSupport)
```

---

## 3. User-Facing API

### 3a. build.shk (t2 — primary authoring surface)

Users construct the graph declaratively, Bazel-style. With standard macros,
most projects need only a few lines:

```lisp
;; build.shk — macro-powered (typical usage)
(program
  (macro-import shk "minishake")

  (shk/ts-rule      compile-ts  "tsconfig.json")
  (shk/copy-rule    copy-assets "assets" "dist/assets")
  (shk/esbuild-rule bundle      "dist/index.js" "dist/bundle.min.js"
                     compile-ts copy-assets))
```

For non-standard cases, rules can be written manually:

```lisp
;; build.shk — manual rules (full control)
(program
  (macro-import shk "minishake")

  (shk/rule bundle
    (output "dist/bundle.min.js")
    (deps   "src/**/*.ts" "tsconfig.json" compile-ts copy-assets
            (env NODE_ENV) (tool esbuild))
    (async-lambda (ctx)
      (await (. ctx (run "esbuild"
        (array "dist/index.js" "--minify" "--outfile=dist/bundle.min.js"))))))

  (shk/rule compile-ts
    (output "dist/index.js")
    (deps   "src/**/*.ts" "tsconfig.json" (tool tsc))
    (async-lambda (ctx)
      (await (. ctx (run "tsc" (array))))))

  (shk/rule copy-assets
    (output "dist/assets")
    (deps   "assets/**/*")
    (async-lambda (ctx)
      (await (. ctx (copy "assets" "dist/assets"))))))
```

### 3b. TypeScript/JavaScript interop (for consumers without t2)

The compiled API is a normal npm package. Users who prefer TypeScript
lose compile-time macros but retain full access to the graph:

```typescript
// build.ts — plain TypeScript (no macros, no t2 required)
import { BuildGraph } from "minishake";

const graph = new BuildGraph();

graph.rule({
  name:   "bundle",
  output: "dist/bundle.min.js",
  deps: [
    { kind: "rule", name: "compile-ts" },
    { kind: "rule", name: "copy-assets" },
    { kind: "env",  key:  "NODE_ENV" },
  ],
  action: async (ctx) => {
    await ctx.run("esbuild", ["dist/index.js", "--minify",
                               "--outfile=dist/bundle.min.js"]);
  },
});

graph.rule({
  name:   "compile-ts",
  output: "dist/index.js",
  deps: [
    { kind: "glob", pattern: "src/**/*.ts" },
    { kind: "file", path:    "tsconfig.json" },
    { kind: "tool", name:    "tsc" },
  ],
  action: async (ctx) => {
    await ctx.run("tsc", []);
  },
});

graph.rule({
  name:   "copy-assets",
  output: "dist/assets",
  deps: [
    { kind: "glob", pattern: "assets/**/*" },
  ],
  action: async (ctx) => {
    await ctx.copy("assets", "dist/assets");
  },
});
```

---

## 4. Graph Construction (from rule definitions)

```
function buildGraphFromRules(rules: Rule[], projectDir: string): BuildGraph
  graph = empty BuildGraph
  graph.env = probeEnvironment(projectDir)

  for each rule in rules:
    // create the output node
    ruleNodeId = "rule:" + rule.name
    graph.nodes.set(ruleNodeId, {
      id: ruleNodeId, kind: "rule",
      path: rule.output, hash: null, lastBuilt: null
    })
    graph.rules.set(rule.name, rule)

    // create edges from output → each dependency
    for each dep in rule.deps:
      match dep.kind:
        "file":
          depId = "file:" + dep.path
          ensureSourceNode(graph, depId, dep.path)
          addEdge(graph, ruleNodeId, depId)

        "glob":
          for each path in expandGlob(dep.pattern):
            depId = "file:" + path
            ensureSourceNode(graph, depId, path)
            addEdge(graph, ruleNodeId, depId)

        "rule":
          depId = "rule:" + dep.name
          addEdge(graph, ruleNodeId, depId)

        "env":
          depId = "env:" + dep.key
          graph.nodes.set(depId, {
            id: depId, kind: "source",
            hash: hashString(process.env[dep.key] ?? ""), lastBuilt: null
          })
          addEdge(graph, ruleNodeId, depId)

        "tool":
          depId = "tool:" + dep.name
          graph.nodes.set(depId, {
            id: depId, kind: "source",
            hash: hashToolVersion(dep.name), lastBuilt: null
          })
          addEdge(graph, ruleNodeId, depId)

  return graph


function ensureSourceNode(graph, id, path):
  if not graph.nodes.has(id):
    graph.nodes.set(id, {
      id, kind: "source", path,
      hash: hashFileContents(path), lastBuilt: null
    })
```

---

## 5. Build Execution (demand-driven, depth-first)

```
function build(graph: BuildGraph, targetName: string, projectRoot: string): void
  targetId = "rule:" + targetName
  if targetId not in graph.nodes:
    throw new Error("unknown rule: " + targetName)

  // load persisted graph from disk (if exists) to get previous hashes
  // NOTE: previousHashes has nodes and edges but NO rules map — Rule.action
  // is a function and cannot be serialized. The fresh `graph` has rules;
  // `previousHashes` is only used for hash comparison.
  previousHashes = loadGraph(".shk/graph/build-graph.json")

  // validate environment compatibility before trusting persisted hashes
  if previousHashes != null:
    currentEnv = probeEnvironment(projectRoot)
    validateEnvironment(previousHashes.env, currentEnv)

  logWriter = new LogWriter(projectRoot)
  try:
    // walk the graph, rebuild what's stale
    visiting = new Set<NodeId>()   // in-progress (for cycle detection)
    visited  = new Set<NodeId>()   // complete
    rebuild(graph, previousHashes, targetId, visiting, visited, logWriter, projectRoot)
  finally:
    // always persist the graph, even on failure — completed nodes keep their hashes
    saveGraph(graph, ".shk/graph/build-graph.json")
    logWriter.close()


function rebuild(graph, prev, nodeId, visiting, visited, logWriter, projectRoot): void
  if nodeId in visited: return

  // cycle detection: if we're already visiting this node, we have a cycle
  if nodeId in visiting:
    throw new CycleError("dependency cycle detected", collectCyclePath(visiting, nodeId))

  visiting.add(nodeId)
  node = graph.nodes.get(nodeId)

  // source nodes: just rehash from disk / env / tool
  if node.kind == "source":
    try:
      refreshSourceHash(node, projectRoot)
    catch e:
      throw new BuildError("failed to hash source node " + nodeId + ": " + e.message)
    visiting.delete(nodeId)
    visited.add(nodeId)
    return

  // rule nodes: first rebuild all dependencies (depth-first)
  deps = graph.edges.get(nodeId) ?? new Set()
  for each depId in deps:
    rebuild(graph, prev, depId, visiting, visited, logWriter, projectRoot)

  // now check: is this node stale?
  inputHash = computeInputHash(graph, nodeId)
  prevNode  = prev?.nodes.get(nodeId)

  if prevNode != null AND prevNode.hash == inputHash:
    // all dependency hashes match — node is current, skip
    node.hash      = prevNode.hash
    node.lastBuilt = prevNode.lastBuilt
    logWriter.write({ type: "cache-hit", rule: nodeId, hash: inputHash, time: Date.now() })
    visiting.delete(nodeId)
    visited.add(nodeId)
    return

  // stale — execute the rule's action
  rule = graph.rules.get(ruleNameFrom(nodeId))
  logWriter.write({ type: "rule-start", rule: nodeId, time: Date.now() })
  logWriter.write({ type: "cache-miss", rule: nodeId, hash: inputHash, time: Date.now() })

  ctx = new BuildContext(graph, nodeId, projectRoot, logWriter)
  try:
    await rule.action(ctx)
    // success: update node metadata
    node.hash      = inputHash
    node.lastBuilt = Date.now()
    logWriter.write({ type: "rule-end", rule: nodeId, time: Date.now(), status: "ok" })
  catch e:
    // failure: do NOT update hash — node remains stale for next run
    logWriter.write({ type: "rule-end", rule: nodeId, time: Date.now(), status: "error" })
    throw e

  visiting.delete(nodeId)
  visited.add(nodeId)
```

---

## 6. Input Hash Computation

```
function computeInputHash(graph, nodeId): Hash
  deps = graph.edges.get(nodeId) ?? []

  hasher = createHasher("sha256")

  // sort deps for determinism
  for each depId in sorted(deps):
    depNode = graph.nodes.get(depId)
    hasher.update(depId)
    hasher.update(depNode.hash ?? "null")

  // include the rule's own structural identity
  // (so that changing the rule definition invalidates the output)
  rule = graph.rules.get(ruleNameFrom(nodeId))
  hasher.update(rule.output)
  hasher.update(JSON.stringify(rule.deps))

  return hasher.digest("hex")
```

---

## 7. Source Node Refresh

```
function refreshSourceHash(node: GraphNode, projectRoot: string): void
  match nodeIdKind(node.id):
    "file":
      nativePath = toNative(node.path, projectRoot)
      if not existsSync(nativePath):
        throw new Error("source file not found: " + node.path)
      node.hash = hashFileContents(nativePath)
    "env":
      key = node.id.replace("env:", "")
      node.hash = hashString(process.env[key] ?? "")
    "tool":
      name = node.id.replace("tool:", "")
      node.hash = hashToolVersion(name)


function hashFileContents(nativePath: string): Hash
  return sha256(readFileSync(nativePath))

function hashToolVersion(name: string): Hash
  result = execSync(name + " --version")
  if result.status != 0:
    throw new Error("tool '" + name + "' not found or --version failed")
  return sha256(result.stdout.trim())

function hashString(s: string): Hash
  return sha256(s)
```

---

## 8. Graph Persistence

```
function saveGraph(graph, graphPath):
  // NOTE: the `rules` map is NOT serialized. Rule.action is a function
  // and cannot be persisted. The persisted graph contains only nodes,
  // edges, hashes, and the environment snapshot. On the next build,
  // rules are re-loaded from build.shk into a fresh graph, and the
  // persisted graph is loaded only for hash comparison (see `previousHashes`
  // in build()).
  data = {
    version: 1,
    env: graph.env,
    nodes: Object.fromEntries(
      [...graph.nodes].map(([id, node]) =>
        [id, { kind: node.kind, path: node.path,
               hash: node.hash, lastBuilt: node.lastBuilt }]
      )
    ),
    edges: Object.fromEntries(
      [...graph.edges].map(([from, tos]) =>
        [from, [...tos]]
      )
    ),
  }
  mkdirSync(dirname(graphPath), { recursive: true })
  // atomic write: write to temp file, then rename
  tmpPath = graphPath + ".tmp"
  writeFileSync(tmpPath, JSON.stringify(data, null, 2))
  renameSync(tmpPath, graphPath)


const GRAPH_VERSION = 1;

function loadGraph(graphPath): BuildGraph | null
  if not existsSync(graphPath): return null
  try:
    data = JSON.parse(readFileSync(graphPath))
  catch e:
    warn("corrupted graph file, starting fresh: " + e.message)
    return null

  // version gate: reject graphs from incompatible format versions
  if data.version !== GRAPH_VERSION:
    warn("graph version mismatch (file: " + data.version
      + ", expected: " + GRAPH_VERSION + ") — starting fresh")
    return null

  graph = new BuildGraph()
  graph.env = data.env
  for each [id, nodeData] in entries(data.nodes):
    graph.nodes.set(id, { id, ...nodeData })
  for each [from, tos] in entries(data.edges):
    graph.edges.set(from, new Set(tos))
  return graph
```

---

## 9. BuildContext (passed to rule actions)

```typescript
class BuildContext {
  graph:       BuildGraph;
  nodeId:      NodeId;
  projectRoot: string;      // native absolute path to project root
  logWriter:   LogWriter;

  constructor(graph: BuildGraph, nodeId: NodeId, projectRoot: string, logWriter: LogWriter) {
    this.graph = graph;
    this.nodeId = nodeId;
    this.projectRoot = projectRoot;
    this.logWriter = logWriter;
  }

  // All public methods accept PosixPath (project-relative, forward-slash).
  // Conversion to native paths happens here, at the I/O boundary.

  async run(tool: string, args: string[]): Promise<RunResult> {
    this.log({ type: "command-run", rule: this.nodeId, tool, args, time: Date.now() });
    const result = await execAsync(tool, args, { cwd: this.projectRoot });
    if (result.exitCode !== 0)
      throw new BuildError(this.nodeId, tool, result.stderr);
    return result;
  }

  async copy(src: PosixPath, dest: PosixPath): Promise<void> {
    this.log({ type: "file-copy", rule: this.nodeId, src, dest, time: Date.now() });
    await cpAsync(toNative(src, this.projectRoot),
                  toNative(dest, this.projectRoot), { recursive: true });
  }

  async readFile(p: PosixPath): Promise<string> {
    this.log({ type: "file-read", rule: this.nodeId, path: p, time: Date.now() });
    return await readFileAsync(toNative(p, this.projectRoot), "utf-8");
  }

  async writeFile(p: PosixPath, data: string): Promise<void> {
    this.log({ type: "file-write", rule: this.nodeId, path: p, time: Date.now() });
    await writeFileAsync(toNative(p, this.projectRoot), data);
  }

  // Escape hatch: get a native absolute path when needed (e.g. for tool args)
  resolve(p: PosixPath): string {
    return toNative(p, this.projectRoot);
  }

  // Dynamic dependency: add an edge discovered at build time.
  // (e.g. from compiler API or metafile output)
  //
  // The new dep is resolved to a node, the edge is added, and the source
  // node is rehashed immediately. However, this does NOT affect the current
  // rule's input hash for this run — the current execution was already
  // triggered. The new edge takes effect on the NEXT build: if the newly
  // added source changes, this rule will be stale.
  addDep(dep: Dep): void {
    const depId = resolveDep(this.graph, dep, this.projectRoot);
    ensureEdgeSet(this.graph.edges, this.nodeId);
    this.graph.edges.get(this.nodeId)!.add(depId);
    this.log({ type: "dep-edge", from: this.nodeId, to: depId, time: Date.now() });
  }

  private log(entry: LogEntry): void {
    this.logWriter.write(entry);
  }
}
```

---

## 10. Build File Loading

The bridge between t2 source (`build.shk`) and the engine's `Rule[]` array.

```
function loadBuildFile(filePath: string, projectRoot: string): Rule[]
  // Step 1: Compile build.shk (t2) → build.shk.ts (TypeScript)
  //   The t2 compiler runs macro expansion here — macro-time code executes,
  //   shk/ts-rule reads tsconfig.json, globs expand, etc.
  //   Output: a .ts file that imports minishake and calls graph.rule() N times.
  tsSource = t2compile(filePath)

  // Step 2: Compile build.shk.ts → build.shk.js (JavaScript)
  //   Standard tsc or esbuild transpilation. No type-checking needed —
  //   the t2 compiler already validated types.
  jsPath = tsToJs(tsSource)

  // Step 3: Import the compiled JS module
  //   The module's top-level code runs, calling graph.rule() for each rule.
  //   We provide a RuleCollector that captures the rule definitions.
  collector = new RuleCollector()
  module = await import(jsPath)

  // The module is expected to export a function that receives the collector,
  // OR the compiled output calls a global/injected `rule()` function.
  // Convention: the compiled module calls shk.rule() which appends to collector.
  module.default(collector)

  return collector.rules


class RuleCollector
  rules: Rule[] = []

  rule(def: { name, output, deps, action }): void
    // validate: name must be unique
    if this.rules.some(r => r.name == def.name):
      throw new Error("duplicate rule name: " + def.name)
    // validate: output must be a non-empty string
    if !def.output:
      throw new Error("rule " + def.name + " has no output")
    this.rules.push(def)
```

**MVP shortcut:** Before t2 compilation is wired up, the build file can be
a plain `.ts` or `.js` file that exports a function. This unblocks engine
development without depending on the t2 compiler pipeline:

```typescript
// example/build.ts — MVP bootstrap (no t2 required)
import type { RuleCollector } from "minishake";

export default function(shk: RuleCollector) {
  shk.rule({
    name:   "compile",
    output: "dist/uses.js",
    deps: [
      { kind: "glob", pattern: "src/**/*.ts" },
      { kind: "file", path:    "tsconfig.json" },
      { kind: "tool", name:    "tsc" },
    ],
    action: async (ctx) => {
      await ctx.run("tsc", []);
    },
  });
}
```

---

## 11. Error Handling Invariants

These invariants hold across the entire build execution. They must be
maintained by the implementation, not left to individual call sites.

**Rule action failure:**
- If a rule's action throws, the node's hash is NOT updated (remains `null`
  or the previous stale value).
- The graph is still saved to disk — other nodes that were successfully built
  retain their updated hashes. A failed build does not discard progress.
- The error propagates up to the CLI, which reports the failure and exits
  with a non-zero code.
- Partial outputs from the failed rule are NOT cleaned up automatically.
  (The next run will see a stale node and re-execute the rule.)

**Missing source files:**
- If a file dep points to a nonexistent path, `hashFileContents` throws.
  This is a hard error — the build halts. The rule cannot run without its
  declared inputs.
- If a glob dep expands to zero files, this is NOT an error — it produces
  zero edges. The rule runs with no file deps. (An empty glob may be
  intentional, e.g. an optional assets directory.)

**Tool not installed:**
- If `hashToolVersion(name)` fails (the tool binary is not found, or
  `--version` exits non-zero), this is a hard error. The build halts
  with a message: `"tool 'tsc' not found or --version failed"`.

**Corrupted graph JSON:**
- If `loadGraph` fails to parse the JSON, it logs a warning and returns
  `null` — treating this as a cold start. The build proceeds as if no
  previous graph exists. The corrupted file is overwritten on save.

**Cycle detection:**
- Cycles are detected during `rebuild()` via the `visited` set. If
  `rebuild` is called for a nodeId that is already in `visited` but
  has not finished building, this is a cycle.
- Implementation: use two sets — `visiting` (in progress) and `visited`
  (complete). If a node is in `visiting` when entered, throw a cycle error
  listing the cycle path.

```
function rebuild(graph, prev, nodeId, visiting, visited): void
  if nodeId in visited: return
  if nodeId in visiting:
    throw new CycleError("dependency cycle detected", collectCyclePath(visiting, nodeId))

  visiting.add(nodeId)

  // ... existing rebuild logic ...

  visiting.delete(nodeId)
  visited.add(nodeId)
```

**Graph save atomicity:**
- Write to a temp file (`.shk/graph/build-graph.json.tmp`), then rename.
  This prevents a crash during write from corrupting the graph.

---

## 12. Logging

```typescript
// ── Log entry types ──────────────────────────

type LogEntry =
  | { type: "rule-start";   rule: NodeId; time: number }
  | { type: "rule-end";     rule: NodeId; time: number; status: "ok" | "error" | "skip" }
  | { type: "file-read";    rule: NodeId; path: PosixPath; time: number }
  | { type: "file-write";   rule: NodeId; path: PosixPath; time: number }
  | { type: "file-copy";    rule: NodeId; src: PosixPath; dest: PosixPath; time: number }
  | { type: "command-run";  rule: NodeId; tool: string; args: string[]; time: number }
  | { type: "dep-edge";     from: NodeId; to: NodeId; time: number }
  | { type: "cache-hit";    rule: NodeId; hash: Hash; time: number }
  | { type: "cache-miss";   rule: NodeId; hash: Hash; time: number }
  | { type: "env-check";    key: string; hash: Hash; time: number }
  | { type: "tool-check";   tool: string; version: string; hash: Hash; time: number }
  ;

// ── Log writer ───────────────────────────────

class LogWriter
  fd:       FileHandle;
  filePath: string;

  constructor(projectRoot: string):
    timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    this.filePath = path.join(projectRoot, ".shk/logs/run-" + timestamp + ".jsonl")
    mkdirSync(dirname(this.filePath), { recursive: true })
    this.fd = openSync(this.filePath, "a")

  write(entry: LogEntry): void
    appendFileSync(this.fd, JSON.stringify(entry) + "\n")

  close(): void
    closeSync(this.fd)
```

**Integration with BuildContext:** The `BuildContext` constructor receives a
`LogWriter` instance. Every SDK method (`run`, `copy`, `readFile`, `writeFile`)
calls `logWriter.write(...)` before performing the operation. The `build()`
function writes `rule-start`, `rule-end`, `cache-hit`, and `cache-miss`
entries around rule execution.

---

## 13. Mermaid Graph Export

```
function emitMermaid(graph: BuildGraph, outPath: string): void
  lines = ["graph LR"]

  // emit nodes with labels
  for each [id, node] in graph.nodes:
    label = node.path ?? id
    shape = node.kind == "source" ? "([" + label + "])" : "[[" + label + "]]"
    lines.push("  " + sanitize(id) + shape)

  // emit edges
  for each [from, tos] in graph.edges:
    for each to in tos:
      lines.push("  " + sanitize(from) + " --> " + sanitize(to))

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, lines.join("\n"))


// mermaid node IDs can't contain colons or slashes
function sanitize(id: string): string
  return id.replace(/[^a-zA-Z0-9_]/g, "_")
```

---

## 14. CLI Entry Point

```
function main(argv):
  command    = argv[0]   // "build", "graph", "explain", "clean"
  targetName = argv[1]   // e.g. "bundle"
  projectRoot = process.cwd()

  match command:
    "build":
      rules = loadBuildFile("build.shk", projectRoot)
      graph = buildGraphFromRules(rules, projectRoot)
      build(graph, targetName)

    "graph":
      prevGraph = loadGraph(".shk/graph/build-graph.json")
      if prevGraph == null: error("no graph yet — run shk build first")
      emitMermaid(prevGraph, ".shk/graph/last-run.mmd")

    "explain":
      // need both: fresh graph (with current source hashes) and persisted graph (previous hashes)
      rules = loadBuildFile("build.shk", projectRoot)
      currentGraph = buildGraphFromRules(rules, projectRoot)
      refreshAllSourceHashes(currentGraph)
      prevGraph = loadGraph(".shk/graph/build-graph.json")
      explainStaleness(currentGraph, prevGraph, "rule:" + targetName)

    "clean":
      rmSync(".shk/", { recursive: true })
```

---

## 15. Explain (why is a node stale?)

```
function explainStaleness(currentGraph, prevGraph, nodeId):
  node = currentGraph.nodes.get(nodeId)
  if node == null:
    print("ERROR: unknown node", nodeId)
    return

  if prevGraph == null:
    print(nodeId, "— never built (no previous graph)")
    return

  prev = prevGraph.nodes.get(nodeId)
  if prev == null:
    print(nodeId, "— never built (new rule)")
    return

  currentDeps = currentGraph.edges.get(nodeId) ?? new Set()
  prevDeps    = prevGraph.edges.get(nodeId) ?? new Set()

  // structural changes: deps added or removed
  added   = setDifference(currentDeps, prevDeps)
  removed = setDifference(prevDeps, currentDeps)
  for each d in added:  print("  ADDED dep:", d)
  for each d in removed: print("  REMOVED dep:", d)

  // content changes: deps whose hash differs
  changed = 0
  for each depId in currentDeps:
    depNode     = currentGraph.nodes.get(depId)
    prevDepNode = prevGraph.nodes.get(depId)

    if prevDepNode == null:
      print("  NEW:", depId)
      changed++
    else if depNode.hash != prevDepNode.hash:
      print("  CHANGED:", depId)
      print("    was:", prevDepNode.hash)
      print("    now:", depNode.hash)
      changed++

  if changed == 0 AND added.size == 0 AND removed.size == 0:
    print(nodeId, "— CURRENT (all", currentDeps.size, "deps unchanged)")
  else:
    print("  (" + changed + " of " + currentDeps.size + " deps changed)")


function refreshAllSourceHashes(graph: BuildGraph): void
  for each [id, node] in graph.nodes:
    if node.kind == "source":
      refreshSourceHash(node)
```

---

## 16. Known MVP Limitations

These are deliberate scope cuts, not bugs. Each is documented so implementers
don't try to solve them and so future work knows where to start.

**Glob expansion is static.** Globs in dep declarations are expanded once at
graph construction time (in `buildGraphFromRules`), before any rule executes.
If rule A creates files that match rule B's glob, rule B will not see them
until the *next* `shk build` invocation. This is acceptable for MVP because
the common case (source files exist before the build starts) is handled
correctly. Watch mode and multi-pass builds are post-MVP.

**No parallel rule execution.** Rules are built depth-first, one at a time.
Independent rules (siblings in the graph) could run in parallel but don't.
This is the simplest correct implementation. Parallelism is a post-MVP
optimization that requires the concurrency controls described in DESIGN.md
Section 3.12.

**No partial rebuilds within a rule.** If a rule runs `tsc` and tsc compiles
100 files, MiniShake treats the entire rule as an atomic unit. It cannot
skip individual file compilations within a rule — that's tsc's job (via
`--incremental`). MiniShake's incrementalism is at the rule granularity.

**`addDep` takes effect next build.** Dynamic dependencies added via
`ctx.addDep()` during rule execution are persisted in the graph, but they
do NOT affect the current rule's input hash for the current run. They take
effect on the next `shk build`. This avoids re-entrant hash computation
mid-execution.

**Single output per rule.** Each rule declares one `output` path. Rules that
produce multiple files (like `tsc` producing `.js`, `.d.ts`, `.map` for each
source file) declare the primary output and treat siblings as implicit.
The hash covers the inputs, not the outputs — if inputs match, all outputs
are assumed current.

---

## 17. Bootstrapping

MiniShake is written in t2, compiled via `t2 → TypeScript → JavaScript`.
MiniShake is also its own build system. This creates a chicken-and-egg
dependency: you need compiled MiniShake to run MiniShake, but you need
MiniShake to compile MiniShake. This is solved with a multi-stage
bootstrap, the same pattern used by GCC, Rust, Go, and OCaml.

### 17.1 The three stages

```
Stage 0  (seed)        A plain Node.js script — no MiniShake involved.
                        Calls the t2 compiler and tsc directly to produce
                        dist/ from src/*.t2. This is the only build step
                        that does NOT use MiniShake. Checked into the repo
                        as bootstrap.js.

Stage 1  (self-build)  The Stage 0 output (compiled MiniShake) uses its
                        own build.shk to rebuild itself from the same
                        src/*.t2 source. Output goes to dist-stage1/.

Stage 2  (verify)      Diff dist/ (Stage 0) against dist-stage1/ (Stage 1).
                        If identical: the bootstrap is sound — MiniShake
                        produces the same output as the seed script.
                        If different: a bug — the build is not reproducible.
```

After verification, `dist-stage1/` replaces `dist/` and becomes the
canonical build output. From this point on, developers use `shk build`
(Stage 1) for day-to-day work. The seed script is kept for cold bootstrap
and CI reproducibility checks.

### 17.2 bootstrap.js (the seed)

```javascript
#!/usr/bin/env node
// bootstrap.js — Stage 0 seed build. No MiniShake dependency.
// Compiles src/*.t2 → dist/*.ts → dist/*.js + dist/*.d.ts
// using only the t2 compiler (from ../t2lang) and tsc.

import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT    = import.meta.dirname;
const SRC     = path.join(ROOT, "src");
const DIST    = path.join(ROOT, "dist");
const T2      = path.join(ROOT, "node_modules/.bin/t2");  // from t2lang dep

// Step 1: t2 → TypeScript
mkdirSync(DIST, { recursive: true });
const t2Files = readdirSync(SRC).filter(f => f.endsWith(".t2"));
for (const f of t2Files) {
  execFileSync(T2, [
    path.join(SRC, f),
    "--outdir", DIST,
    "--emit", "ts"
  ], { stdio: "inherit" });
}

// Step 2: TypeScript → JavaScript
execFileSync("npx", ["tsc", "--project", "tsconfig.json"], {
  cwd: ROOT,
  stdio: "inherit",
});

console.log("Stage 0 bootstrap complete: dist/ ready");
```

The seed script is intentionally simple and has no dependency on MiniShake.
It must remain runnable on a fresh clone with only `npm install` as a
prerequisite.

### 17.3 build.shk (self-hosting build file)

```lisp
;; build.shk — MiniShake builds itself
(program
  (macro-import shk "minishake")

  ;; Rule: compile t2 source → TypeScript
  (shk/rule t2-compile
    (output "dist/shk.ts")     ;; primary output (representative)
    (deps   "src/**/*.t2" (tool t2))
    (async-lambda (ctx)
      ;; compile each .t2 file to .ts in dist/
      (await (. ctx (run "t2" (array "src/" "--outdir" "dist/" "--emit" "ts"))))))

  ;; Rule: compile TypeScript → JavaScript + declarations
  (shk/rule ts-compile
    (output "dist/shk.js")     ;; primary output (representative)
    (deps   t2-compile "tsconfig.json" (tool tsc))
    (async-lambda (ctx)
      (await (. ctx (run "tsc" (array)))))))
```

### 17.4 Bootstrap workflow

**First time (cold clone):**
```
npm install                    # install t2lang, typescript
node bootstrap.js              # Stage 0: seed build → dist/
node dist/shk.js build ts-compile  # Stage 1: self-build → dist-stage1/
diff -r dist/ dist-stage1/     # Stage 2: verify reproducibility
```

**Day-to-day development:**
```
shk build ts-compile           # uses the already-compiled dist/shk.js
```

**CI reproducibility check:**
```
node bootstrap.js              # fresh Stage 0
shk build ts-compile --outdir dist-stage1/
diff -r dist/ dist-stage1/     # must be identical
```

### 17.5 Bootstrap invariants

- **bootstrap.js has zero MiniShake imports.** If it ever imports from
  `"minishake"`, the bootstrap is circular and broken.
- **bootstrap.js is not the build system.** It exists only to produce the
  first working copy of MiniShake. All real builds use `build.shk`.
- **dist/ is committed.** The compiled output is checked into the repo so
  that users can `npm install minishake` and get a working tool without
  needing the t2 compiler. This is the same pattern used by TypeScript
  itself (which commits its compiled output).
- **Stage 2 diff must pass.** If the seed output and the self-built output
  diverge, the build is nondeterministic or the seed script is wrong.
  CI enforces this.

### 17.6 When to re-run Stage 0

The seed script only needs to run when:
1. Fresh clone (no `dist/` yet, though it should be committed)
2. The `dist/` output is suspected to be corrupt
3. CI reproducibility check
4. Major changes to the t2 compiler that affect output format

For all other development, Stage 1 (`shk build`) is sufficient because
the compiled MiniShake in `dist/` can compile the updated `src/*.t2`.

---

## 18. Implementation Language

MiniShake is implemented in t2. The build chain is:

```
src/*.t2  →  t2 compiler  →  dist/*.ts  →  tsc  →  dist/*.js + dist/*.d.ts
```

The published npm package contains compiled `.js` and `.d.ts` files. Consumers
use MiniShake as a normal TypeScript/JavaScript dependency — no t2 toolchain
required. The t2 source is the authoring surface; the compiled output is the
interop surface.

For build files (`build.shk`), t2 is required because the macro system
(`defmacro`, `macro-time`) powers the standard macros (Section 3.8 of DESIGN.md).
Users who prefer plain TypeScript can call the compiled API directly — they
lose compile-time macros but gain full access to the graph, rules, and context.

## 19. Module Structure

```
src/
  paths.t2        — PosixPath branded type, toPosix(), toNative(), normalization
  env.t2          — BuildEnvironment, probeEnvironment(), validateEnvironment(), fs probes
  graph.t2        — GraphNode, GraphEdge, BuildGraph, addEdge, ensureSourceNode
  rule.t2         — Rule, Dep, buildGraphFromRules
  hash.t2         — hashFileContents, hashString, hashToolVersion, computeInputHash
  build.t2        — build(), rebuild(), refreshSourceHash(), refreshAllSourceHashes()
  context.t2      — BuildContext (run, copy, readFile, writeFile, addDep, resolve)
  persist.t2      — saveGraph(), loadGraph() (atomic write via rename)
  explain.t2      — explainStaleness(), refreshAllSourceHashes()
  loader.t2       — loadBuildFile(), RuleCollector
  shk.t2          — main() entry point, arg parsing
  log.t2          — LogEntry, LogWriter
  mermaid.t2      — emitMermaid(), sanitize()
  errors.t2       — BuildError, CycleError, collectCyclePath()
  macros.t2       — standard macros: deps-from, ts-rule, copy-rule, esbuild-rule,
                     ts-project-rules, capability inference

bootstrap.js      — Stage 0 seed build (plain Node.js, no MiniShake)
build.shk         — Stage 1 self-hosting build (MiniShake builds itself)

dist/             — compiled output (committed + published)
  *.ts            — TypeScript (from t2)
  *.js            — JavaScript (from tsc)
  *.d.ts          — type declarations (for TS/JS consumers)

dist-stage1/      — Stage 1 output (temporary, for verification only)
```

---

## 20. Worked Example: `example/`

The `example/` directory contains a minimal TypeScript project that serves as
the reference build target for MiniShake. This section shows three equivalent
build scripts — macro-powered, manual t2, and plain TypeScript — that all
produce the same build graph and the same result as `npm run build && npm run start`.

### 20.1 The project

```
example/
  src/
    core.ts           — exports sayHello(name)
    uses.ts           — imports core.js, calls sayHello("Myself")
  dist/               — tsc output (core.js, uses.js, .d.ts, .map files)
  tsconfig.json       — rootDir: src, outDir: dist, module: nodenext
  package.json        — type: module, build: tsc, start: node dist/uses.js
```

Source files:

```typescript
// src/core.ts
export function sayHello(toName: string): void {
    console.log("Hello", toName);
}

// src/uses.ts
import { sayHello } from './core.js';
sayHello("Myself");
```

The build is simple: `tsc` compiles `src/*.ts` → `dist/*.js`. The output
artifact the user cares about is `dist/uses.js` (the entry point).

### 20.2 build.shk — macro-powered (recommended)

```lisp
;; example/build.shk
(program
  (macro-import shk "minishake")

  ;; One line: reads tsconfig.json at macro-time, infers src glob,
  ;; outDir, tool dep, and generates the full rule.
  (shk/ts-rule compile "tsconfig.json"))
```

That's it. `shk build compile` compiles the project. The macro expands
`tsconfig.json` at compile time and generates a rule equivalent to the
manual version below.

### 20.3 build.shk — manual rules (full control)

```lisp
;; example/build.shk
(program
  (macro-import shk "minishake")

  ;; The goal: dist/uses.js (and all other tsc outputs)
  ;; Dependencies: every .ts file in src/, the tsconfig, and the tsc tool
  ;; Action: run tsc

  (shk/rule compile
    (output "dist/uses.js")
    (deps   "src/**/*.ts" "tsconfig.json" (tool tsc))
    (async-lambda (ctx)
      (await (. ctx (run "tsc" (array)))))))
```

#### What the graph looks like after `shk build compile`:

```
rule:compile ──→ file:src/core.ts
             ──→ file:src/uses.ts
             ──→ file:tsconfig.json
             ──→ tool:tsc
```

- `rule:compile` is the output node (produces `dist/uses.js` + siblings)
- Four dependency edges point to source/config/tool nodes
- On the next `shk build compile`: if none of the four dependency hashes
  changed, the rule is current — skip. If `src/core.ts` was edited,
  its content hash changes, `rule:compile` is stale, tsc re-runs.

#### Staleness trace (`shk explain compile`):

```
$ shk explain compile
rule:compile — STALE
  CHANGED: file:src/core.ts
    was: a1b2c3...
    now: d4e5f6...
  (1 of 4 deps changed)
```

### 20.4 build.ts — plain TypeScript (no t2 required)

For users who don't want t2, the same build expressed via the compiled API:

```typescript
// example/build.ts
import { BuildGraph } from "minishake";

const graph = new BuildGraph();

graph.rule({
  name:   "compile",
  output: "dist/uses.js",
  deps: [
    { kind: "glob", pattern: "src/**/*.ts" },
    { kind: "file", path:    "tsconfig.json" },
    { kind: "tool", name:    "tsc" },
  ],
  action: async (ctx) => {
    await ctx.run("tsc", []);
  },
});
```

### 20.5 Build execution walkthrough

What happens when you run `shk build compile` for the first time:

```
1. Load build.shk, register rules
2. buildGraphFromRules():
   - Probe environment → store in graph.env
   - Create node  rule:compile    (kind: rule, path: "dist/uses.js")
   - Expand glob  "src/**/*.ts"   → src/core.ts, src/uses.ts
   - Create node  file:src/core.ts  (kind: source, hash: sha256 of contents)
   - Create node  file:src/uses.ts  (kind: source, hash: sha256 of contents)
   - Create node  file:tsconfig.json (kind: source, hash: sha256 of contents)
   - Create node  tool:tsc          (kind: source, hash: sha256 of `tsc --version`)
   - Create edges rule:compile → each of the 4 deps
3. build(graph, "compile"):
   - Load previous graph from .shk/graph/build-graph.json (none — first run)
   - Walk to rule:compile
   - Refresh source hashes (read files from disk, run tsc --version)
   - No previous graph → node is stale
   - Execute rule action: run tsc
   - tsc reads src/core.ts, src/uses.ts, tsconfig.json
   - tsc writes dist/core.js, dist/uses.js, .d.ts, .map files
   - Compute input hash from 4 dep hashes, store on rule:compile node
   - Save graph to .shk/graph/build-graph.json
4. Done. dist/uses.js exists. `node dist/uses.js` → "Hello Myself"
```

Second run (nothing changed):

```
1. Load build.shk, register rules
2. buildGraphFromRules() — same as before
3. build(graph, "compile"):
   - Load previous graph from .shk/graph/build-graph.json
   - Validate environment (same platform, case sensitivity, etc.)
   - Walk to rule:compile
   - Refresh source hashes from disk
   - All 4 dep hashes match previous graph → rule:compile is CURRENT
   - Skip execution
   - Save graph (unchanged)
4. Done. No tsc invocation. Instant.
```

Second run (src/core.ts edited):

```
1-2. Same as above
3. build(graph, "compile"):
   - Load previous graph
   - Validate environment
   - Walk to rule:compile
   - Refresh source hashes — file:src/core.ts hash differs
   - Input hash changed → rule:compile is STALE
   - Execute rule action: run tsc
   - Update node hash, save graph
4. Done. tsc ran once. dist/ updated.
```
