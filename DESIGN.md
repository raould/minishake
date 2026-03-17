license: public domain CC0

# MiniShake Design Doc (MVP and Beyond)

**Tagline:** A persistent build graph with Shake-like demand-driven evaluation, Bazel-like content-addressed accuracy, t2 scripting, and TypeScript-first toolchain integration.

---

## 1. Motivation

### 1.1 The pain today

**npm scripts**
- No dependency tracking
- No incrementalism
- No portability (shell, OS, env differences)
- No introspection ("what does this script depend on?")
- No caching, no correctness guarantees

**Makefiles**
- Not JS-native
- Fragile, shell-heavy, OS-dependent
- Hard to integrate with modern JS tools (tsc, esbuild, etc.)

**Bazel / Nix**
- Powerful but hostile to JS workflows
- Require explicit graphs, BUILD files, Starlark/Nix DSLs
- Poor understanding of JS/TS module resolution, bundlers, plugins
- Overkill for most JS projects, under-ergonomic for all

**Ad-hoc build scripts**
- Shell scripts, Node scripts, Gulp/Grunt, custom CLIs
- No consistent model for dependencies, caching, or reproducibility
- Impossible for agents to reason about safely

Result: builds are slow, opaque, non-incremental, non-portable, and fragile.

### 1.2 What developers actually want

- Think in outputs and recipes — the graph is managed for you
- Use JS/TS/t2, not shell or Starlark
- Run standard tools (tsc, esbuild, test runners)
- Have builds be incremental, cached, and mostly deterministic
- Have good logs, good graphs, and good explanations
- Avoid rewriting their entire project around a build system

### 1.3 MiniShake's core promise

MiniShake manages a **build graph** — a persistent, content-addressed DAG of every artifact in your project, from source files to final outputs. You say "build output O" and MiniShake walks the graph backward, rebuilding only what's stale. The graph is the core data structure; caching, incrementalism, and introspection all follow from it.

Build files (`build.shk`) are written top-down: declare the desired final output first, then define the rules that produce its dependencies. MiniShake and its toolchain integrations (TypeScript compiler API, esbuild metafile) automatically discover the fine-grained edges between artifacts, so you don't manually enumerate every file.

- **Shake-like:** demand-driven, dependency-tracked rules
- **Bazel-like:** hashed, toolchain/config aware (within JS scope)
- **Nix-like:** content-addressed, purity-oriented (within JS world)
- **t2-based:** structured, analyzable, scripted in t2 syntax
- **TypeScript-first:** MiniShake's correctness guarantees are strongest for TypeScript (and t2, which transpiles to TypeScript). Pure JavaScript rules receive best-effort tracking only.

And from day one: logging is first-class, committed, and visible in MiniShake's own repo.

### 1.4 Implementation and scripting language: t2

MiniShake itself is implemented in t2, and build files (`build.shk`) are also written in t2. t2 is an s-expression language with TypeScript semantics that transpiles to TypeScript, which transpiles to JavaScript. This means:

- **MiniShake's npm package ships compiled TypeScript/JavaScript.** Any TypeScript or JavaScript project can `import` MiniShake as a normal dependency — no t2 toolchain required for consumers.
- **Build files use t2 syntax** for the macro system benefits described below. Users who prefer TypeScript can use MiniShake's exported API directly in `.ts` files, at the cost of losing compile-time macros.
- **The implementation is self-consistent** — one language for the engine, the SDK, the macros, and the build files.

t2's macro system (`defmacro`, `macro-time`) is a meaningful asset for both the implementation and build scripting: compile-time glob expansion, config introspection, and dependency inference can be done in macros rather than runtime code, giving MiniShake capabilities that npm scripts and Bazel's Starlark do not have.

---

### 1.5 Types

```typescript
/**
 * The runtime definition of a MiniShake rule.
 */

// Paths are represented as generic POSIX-style strings.
// todo: full api or reuse Node.Path.
type Path = string;

// Configuration is dynamic, but typed interfaces are encouraged (see Section 3.10).
// This interface represents the minimal system configuration available to all rules.
interface SystemConfig {
  readonly outputDir: Path;
  readonly logLevel: "info" | "warn" | "error";
  // User-defined keys are merged into the config object at runtime.
  readonly [key: string]: unknown;
}

declare function rule(
  name: string, // Must be unique within the build program.
  systemConfig: SystemConfig,
  capabilities: Capability[],
  body: RuleBody
): void;

// Rules return a Promise (async-lambda).
type RuleBody = () => Promise<void>;

type Capability =
  | FileCapability
  | EnvCapability
  | RunCapability;

interface FileCapability {
  kind: "fs.read" | "fs.write";
  pattern: string; // Glob pattern (e.g., "src/**/*.ts") or specific path.
}

interface EnvCapability {
  kind: "env"; // Permission to READ an environment variable.
  key: string; // e.g., "NODE_ENV"
}

interface RunCapability {
  kind: "run";
  tool: string; // The tool name (e.g., "tsc", "esbuild").
  // Note: Arguments and specific env vars are provided at call time (run.tsc ...),
  // not at capability declaration time.
}
```

---

## 2. Hermeticity Model

MiniShake does not claim sandbox-level hermeticity. It claims **declared-input correctness**: if all inputs are declared through the SDK, cache behavior is correct.

### What MiniShake guarantees

Cache correctness for operations performed through `fs.*`, `env.*`, `run.*`, and other SDK interfaces. If you use the SDK, the hash covers it.

### What MiniShake explicitly does not guarantee

Anything accessed outside the SDK — direct Node APIs, raw `process.env`, `child_process`, network calls — is invisible to the build system. Results may be incorrect if undeclared inputs change.

### How you tighten the guarantee

- **Capability declarations** narrow what a rule is permitted to access
- **Lint rules** flag SDK violations statically (see Appendix A)
- **Discrepancy detection** (Stage 5) flags violations at runtime

Together these progressively close the gap between declared and actual inputs. MiniShake's correctness guarantees only extend to operations performed through its SDK. This is an honest, stable contract — the same contract Bazel makes with its action graph.

---

## 3. Overall Design and Features

### 3.1 The Build Graph

The build graph is MiniShake's central data structure — a persistent, content-addressed DAG that represents every artifact in the project and the dependencies between them.

**Nodes** are artifacts. Every node carries metadata:
- **Path** — location on disk (or a virtual name for computed values like env var snapshots)
- **Content hash** — hash of the artifact's contents, computed via the SDK
- **Build timestamp** — when this node was last produced
- **Producer** — the rule that builds this artifact (`null` for source files)
- **Status** — `source | stale | current`

**Three kinds of nodes:**
- **Source nodes** — leaf nodes with no producer. Files that exist in the repo: `src/index.ts`, `package.json`, `tsconfig.json`. Their hash comes from reading disk.
- **Intermediate nodes** — produced by one rule, consumed by another. Example: `dist/index.js` is a tsc output and an esbuild input.
- **Output nodes** — what the user asks for. `dist/bundle.min.js`. Structurally identical to intermediates; the distinction is simply which node you pass to `shk build`.

**Edges** point from a node to its dependencies: "to build Y, I need X" is an edge Y → X. The user writes `(need compile-ts)` inside a bundling rule, creating an explicit edge. Toolchain integrations (the TypeScript compiler API, esbuild metafile) add fine-grained file-level edges automatically.

**Demand-driven evaluation.** `shk build <target>` starts at the target node and walks edges backward. At each node: if the content hash of all dependencies matches the last build, the node is current — skip it. If any dependency hash changed, the node is stale — re-run its producer rule. This is the Shake evaluation model.

**Top-down authoring.** Build files are written starting from the desired output and working backward through dependencies:

```lisp
(program
  (macro-import minishake "minishake")

  ;; The root — "I want this"
  (rule bundle
    (caps (run esbuild) (fs.write "dist/bundle.min.js"))
    (async-lambda ()
      (need compile-ts)          ;; edge: bundle → compile-ts
      (need copy-assets)         ;; edge: bundle → copy-assets
      (run.esbuild "dist/index.js" :minify true)))

  ;; "Which requires this" — edges to source .ts files discovered via compiler API
  (rule compile-ts
    (caps (run tsc))
    (async-lambda ()
      (run.tsc)))

  ;; "And this" — edges to asset files discovered via glob
  (rule copy-assets
    (caps (fs.read "assets/**") (fs.write "dist/assets"))
    (async-lambda ()
      (fs.copy "assets" "dist/assets" :recursive true))))
```

**Graph persistence.** The graph is stored in `.shk/graph/` and persisted across builds. This means:
- CI environments can use a committed or cached graph instead of starting cold
- `shk graph` visualizes the current graph, not just the last run's log
- `shk explain <rule>` traces the graph to explain why a node is stale
- Toolchain-produced dependency maps (esbuild metafiles, TS compiler API output) are stored as part of the graph, not discarded after each run

**Build environment metadata.** The persisted graph records a snapshot of the environment where it was created. On every subsequent load, MiniShake compares the current environment against the snapshot and halts or warns on incompatible changes.

Stored metadata (all from Node.js built-in APIs, zero external dependencies):

| Field | Source | On mismatch |
|-------|--------|-------------|
| `fs.caseSensitive` | Temp file probe in project dir | **Halt** — node IDs that were unique may now collide |
| `fs.unicodeNormalization` | NFC/NFD probe in project dir | **Halt** — same reason |
| `fs.symlinkSupport` | Symlink probe | Warn |
| `os.platform` | `process.platform` | **Halt** — paths, tools, and behavior differ fundamentally |
| `os.arch` | `process.arch` | Warn |
| `os.release` | `os.release()` | Informational |
| `path.sep` | `path.sep` | Informational (derived from platform) |
| `node.version` | `process.version` | Warn on major version change |
| `node.versions` | `process.versions` (v8, openssl, icu, libuv, etc.) | Informational |
| `ci` | `!!process.env.CI` | Informational |

Filesystem probes (case sensitivity, unicode normalization, symlink support) use the same temp-file patterns that TypeScript, Jest, and Vite use internally — there is no passive API for these in Node.js. The probes run once at graph creation time and are cached in the graph metadata.

Additional informational fields are recorded even if MiniShake doesn't act on them yet — they cost nothing to store and are valuable for debugging cross-platform issues after the fact.

**Graph discovery.** MiniShake can bootstrap a graph from an existing project by:
1. Reading `tsconfig.json` → infer a `compile-ts` rule and its configuration edges
2. Reading `package.json` scripts → infer entry points and tools
3. Running tools once in discovery mode → capture actual dependency edges from compiler API / metafile output
4. Generating a `build.shk` skeleton with the graph pre-populated

### 3.2 Rules

**Unit of computation: a rule**
- Defined in `build.shk` (t2 syntax)
- Has a name and an async body
- **Dependencies as arguments:** Capabilities and config are passed as typed arguments, not metadata.
- Produces one or more nodes in the graph

**Correctness model: "Declared-Input Correctness"**

MiniShake embraces the reality that perfect hermeticity is impossible without OS-level sandboxing (which is slow and complex). Instead, it enforces a contract: **"You strictly declare inputs; we strictly hash them."**

1.  **Responsibility:** The user must explicitly declare all inputs (files, env vars, tools) via capabilities.
2.  **Verification (The Safety Net):** MiniShake provides a `--warn-implicit-inputs` mode (Stage 5) that uses runtime tracing (e.g., `strace` logic or node loader hooks) to detect undeclared filesystem or network access.
3.  **Outcome:** If a tool reads a file `config.json` that wasn't in the declared `fs.read` glob, the build might succeed, but the warning system will flag it as a "hermeticity leak."

Each rule's input hash is derived from the content hashes of all its dependency nodes in the graph:
- File content hashes (via `fs.*`, or resolved by compiler API / metafile)
- Capability declarations and their resolved values (see Section 4)
- Toolchain version nodes (`toolchain:tsc`, `toolchain:esbuild`, `toolchain:node`)
- Config file nodes (`config:tsconfig`, `config:eslint`, etc.)
- Transitive rule output hashes (via `need`)

If input hash unchanged → node is current, skip. If changed → node is stale, re-run rule.

### 3.3 Capability model

Rules declare their capabilities as typed arguments. The runtime enforces them progressively.

```lisp
(program
  (rule build-ts
    (caps (fs.read "src/core/**/*.ts") (env NODE_ENV) (run tsc))
    (async-lambda ()
      (let (files) (fs.glob "src/core/**/*.ts"))
      (run.tsc))))
```

**Capability namespaces (MVP):**
- `fs.read <glob>` — permission to read files matching glob
- `fs.write <glob>` — permission to write files matching glob
- `env <KEY>` — permission to read a specific environment variable
- `run <tool>` — permission to invoke a specific tool

**Granularity:** Medium — capability type plus declared value (glob or key). Coarser than per-file Bazel-style declarations, fine enough to be meaningful.

**What gets hashed:**
- The capability *arguments* — changing a capability argument in the rule definition (like the list of readable globs) invalidates the hash.
- The capability *values* — for `env KEY`, the actual value of that env var at evaluation time is included in the input hash.

**Important:** Capability changes correctly invalidate cache. Adding a new capability argument to a rule changes its input hash, producing a cache miss on the next run. This is intentional and load-bearing.

**Enforcement (pre-MVP and MVP):**
- Undeclared capability usage logs a warning
- Warnings feed naturally into Stage 5 discrepancy detection
- `--strict` mode (post-MVP) promotes warnings to errors

**A rule with no `env` capabilities declared is provably env-pure.** The runtime does not hash any env vars for it. A rule with no `fs.write` capability is read-only — a strong caching signal.

### 3.4 Glob performance guidance

Glob expansions are hashed, not the glob pattern itself. This means a broad glob will produce more frequent cache misses as the codebase grows, because any file added, removed, or changed that matches the glob invalidates the rule — even if the rule doesn't care about that file.

**Prefer narrow globs in capability declarations.** `src/core/**/*.ts` will cache more stably than `src/**/*.ts` — a new test file added anywhere under `src/` will invalidate the latter even if the rule doesn't care about test files.

When a rule cache-misses unexpectedly, the first diagnostic question is: is your glob broader than it needs to be? `shk explain <rule>` (Stage 7) will tell you exactly what triggered the cache miss.

### 3.5 TypeScript dependency tracking

Glob-based dependency declarations are a lie for TypeScript: a type change in a deeply imported file can affect a rule that doesn't explicitly declare that file, `node_modules` shifts, `tsconfig.json` path aliases redirect imports non-obviously. MiniShake cannot and does not attempt to fully solve this via globs.

**Instead, MiniShake uses the TypeScript compiler API to populate the build graph for TypeScript rules.** Before running a `build-ts` rule, MiniShake invokes the TS compiler API to get the full transitive file dependency graph for the compilation. Each resolved file becomes a source node in the build graph, with edges pointing from the rule's output node to every source file the compiler resolved. This is the graph's ground truth for TypeScript — not a glob expansion, but the compiler's actual resolution.

Implications:
- `toolchain:tsc` (the TypeScript version) is load-bearing in the graph, not just as a version stamp but because a TypeScript upgrade can change module resolution and thus the dependency edges
- The compiler API is not stable across TypeScript versions; the integration must be version-pinned and tested on upgrade
- Pure JavaScript files do not have a comparable API and remain on glob-based tracking with best-effort cache correctness
- **Performance Warning:** Invoking the full TS compiler API for dependency resolution is computationally expensive and slow compared to globs. This is a deliberate trade-off prioritizing correctness over raw speed. Because the graph is persisted (see Section 3.1), the compiler API only needs to run when its own inputs change — not on every build.

### 3.6 esbuild dependency tracking

For bundling rules, MiniShake runs esbuild with `metafile: true`. The metafile gives the full input file list, output files, and import relationships for the bundle. Like the TS compiler API, the metafile populates the build graph with fine-grained file-level edges — each file esbuild read becomes a source node with an edge from the bundle output.

**The asymmetry and its resolution:** The TS compiler API provides the dependency graph *before* execution; the esbuild metafile is a *post-execution* artifact. This means the first run of an esbuild rule must always execute to produce the initial dependency map. However, because the graph is persisted (Section 3.1), this is a one-time bootstrap cost, not a per-build penalty.

**Staleness detection for the persisted metafile:** The stored metafile is a snapshot of a previous run's resolution. It can drift when source files add new imports, `node_modules` change, or esbuild config changes. To detect this, MiniShake uses a two-tier check:
1. **Tier 1 (structural):** Hash the metafile's input set plus structural signals (lockfile hash, esbuild config hash, entry point content hashes). If this composite hash changes, the metafile is stale — re-run esbuild to get a fresh dependency map.
2. **Tier 2 (content):** If tier 1 passes, check whether any file listed in the metafile has a changed content hash. If not, the cached output is valid.

This makes the persisted metafile a secondary cache key that accelerates the common case but gets regenerated when the build environment shifts.

esbuild is the selected MVP bundler. Other bundlers are post-MVP.

### 3.7 t2-based `build.shk` scripting API (MVP shape)

**Rules and dependencies**
```lisp
(program
  (rule name caps body)
  (need rule-name))
```

**Filesystem**
```lisp
(fs.read path)
(fs.write path data)
(fs.remove path :recursive true)
(fs.copy src dest :recursive true)
(fs.glob pattern)
(fs.hash path)
```

**Toolchain / commands**
```lisp
(run.node script & args)
(run.command name & args)
(run.tsc & opts)
(run.esbuild entry & opts)
```

**Paths and env**
```lisp
(path.join a b & more)
(env.get key)
```

Note: `env.get` is the only permitted way to read environment variables inside rules. Direct `process.env` access is an undeclared capability and will be flagged by lint rules (see Appendix A).

See Section 3.1 for a complete top-down `build.shk` example showing rules, `need` edges, and capability declarations.

### 3.8 Standard Macros (MiniShake SDK)

MiniShake ships a set of macros that eliminate the boilerplate of common rule patterns. These run at compile time (macro-expansion time, before the build starts), so they can read config files, expand globs, and generate full rule definitions from concise declarations.

Imported via `(macro-import shk "minishake")`.

**`shk/deps-from` — infer dep kind from shape**

Bare strings with wildcards become glob deps, plain strings become file deps, bare symbols become rule deps, and tagged forms handle env/tool:

```lisp
;; expands { kind: "glob", pattern: "src/**/*.ts" }, { kind: "file", path: "tsconfig.json" },
;;         { kind: "rule", name: "compile-ts" }, { kind: "env", key: "NODE_ENV" },
;;         { kind: "tool", name: "tsc" }
(shk/deps-from "src/**/*.ts" "tsconfig.json" compile-ts (env NODE_ENV) (tool tsc))
```

**`shk/ts-rule` — TypeScript compilation rule**

Reads `tsconfig.json` at macro-time to extract `outDir`, source paths, and project references. Generates a rule with correct deps, capabilities (inferred from deps), and action.

```lisp
(shk/ts-rule compile-ts "tsconfig.json")

;; expands to approximately:
;; (rule compile-ts
;;   (output "dist")                              ;; from tsconfig outDir
;;   (deps (glob "src/**/*.ts")                   ;; from tsconfig include/rootDir
;;         (file "tsconfig.json") (tool tsc))
;;   (action (async-lambda () (ctx.run "tsc" []))))
```

**`shk/copy-rule` — directory/file copy rule**

```lisp
(shk/copy-rule copy-assets "assets" "dist/assets")
```

**`shk/esbuild-rule` — esbuild bundling rule**

```lisp
(shk/esbuild-rule bundle "dist/index.js" "dist/bundle.min.js"
                   compile-ts copy-assets)

;; trailing symbols are rule deps (wired as need edges)
```

**`shk/ts-project-rules` — monorepo multi-project generation**

Reads `tsconfig.json` project references at macro-time and generates one `ts-rule` per referenced project, with inter-project dependency edges wired automatically:

```lisp
(shk/ts-project-rules "tsconfig.json")

;; If tsconfig.json has references: ["packages/core", "packages/cli"]
;; expands to two ts-rules with the cli rule depending on the core rule
```

**Capability inference.** All standard macros derive capabilities from the dep list automatically — no separate `caps` block needed:
- Glob/file deps → `fs.read` capability
- Output path → `fs.write` capability
- Tool dep → `run` capability
- Env dep → `env` capability

**Full example — before and after macros:**

```lisp
;; ── Before (manual) ──────────────────
(program
  (macro-import minishake "minishake")

  (rule compile-ts
    (caps (fs.read "src/**/*.ts") (run tsc))
    (async-lambda () (run.tsc)))

  (rule copy-assets
    (caps (fs.read "assets/**") (fs.write "dist/assets"))
    (async-lambda () (fs.copy "assets" "dist/assets" :recursive true)))

  (rule bundle
    (caps (run esbuild) (env NODE_ENV) (fs.write "dist/bundle.min.js"))
    (async-lambda ()
      (need compile-ts)
      (need copy-assets)
      (run.esbuild "dist/index.js" :minify true))))

;; ── After (macro-powered) ────────────
(program
  (macro-import shk "minishake")

  (shk/ts-rule      compile-ts  "tsconfig.json")
  (shk/copy-rule    copy-assets "assets" "dist/assets")
  (shk/esbuild-rule bundle      "dist/index.js" "dist/bundle.min.js"
                     compile-ts copy-assets))
```

Users can always write rules manually for non-standard cases. The macros are conveniences, not constraints — they expand to the same rule definitions you'd write by hand.

### 3.9 Path Model

Paths are deceptively complex across platforms (separators, case sensitivity, drive letters, unicode normalization). MiniShake uses a single internal representation and converts at the boundary.

**Internal representation: POSIX, project-relative.** All paths stored in the build graph, written in `build.shk`, and recorded in logs use forward slashes and are relative to the project root. This is the canonical form — what gets hashed, what gets persisted, what gets compared. Implemented via Node's `path.posix` module, which provides POSIX semantics on all platforms.

**Conversion at the boundary.** When MiniShake performs actual filesystem I/O, it converts the internal path to a native absolute path: `path.resolve(projectRoot, posixPath)`. This handles Windows backslashes and drive letters. The conversion happens inside SDK functions (`ctx.readFile`, `ctx.run`, etc.), never in user code.

**What this means for users:**
- Write `"src/index.ts"` in `build.shk`, never `"src\\index.ts"` or `"C:\\project\\src\\index.ts"`
- All dep paths are relative to project root, forward-slash separated
- `ctx.resolve(posixPath)` is the one escape hatch to get a native absolute path when needed

**Normalization.** Before any path enters the graph as a node ID, MiniShake normalizes it:
- `path.posix.normalize()` to collapse `..` and `.` segments
- Unicode NFC normalization (to handle macOS NFD filesystems)
- On case-insensitive filesystems (detected via the environment probe in Section 3.1), paths are lowercased for comparison and hashing — but the original casing is preserved for display and filesystem access

### 3.10 Cross-platform FS/OS SDK

Backed by Node's standard library (`fs`, `path`, `child_process`, `crypto`), MiniShake provides portable file operations, command execution, path utilities, and environment utilities. No shell syntax, no OS-specific commands. All operations go through MiniShake's operators — analyzable, portable, and tracked for hashing. All paths pass through the normalization described in Section 3.9 before entering the graph.

### 3.11 Logging, history, and introspection

From the beginning, MiniShake logs rule evaluations, file reads/writes, command executions, and dependency edges. Stored in `.shk/` as structured machine-readable logs (JSONL, mermaid).

This enables graph visualization, nondeterminism detection, discrepancy detection, and debugging. MiniShake's own repo commits these logs as a living example.

### 3.12 Output Discovery and Scoping

To capture rule outputs without requiring exhaustive file lists:

- **Defined Scope via Capabilities:** Users must predefine output directories via `fs.write` capabilities. Writes outside these directories are ignored.
- **The Concurrency Challenge:** Simple directory diffing (snapshot before/after) fails if multiple rules write to the same directory concurrently.
- **MVP Solution: Exclusive Output Directories:** Rules utilizing directory diffing for output capture **must** write to rule-exclusive directories. To avoid polluting the final artifact, these should be located in a transient location (e.g., `.tmp_dist/<rule-name>/`) rather than the final output folder (`dist/`). A separate "merge rule" then combines these isolated outputs into the final `dist/` structure.
- **Adaptive Concurrency Control (Smart Scheduling):** To support shared output folders without manual partitioning:
    1.  **Learning Phase:** When a rule is new or modified, MiniShake runs it serially (or with strict locking) to observe its actual filesystem footprint.
    2.  **Execution Phase:** The scheduler uses this historical data to automatically parallelize rules with distinct output paths while enforcing serial execution for rules that share output directories.
    3.  **Safety:** This prevents race conditions in shared folders (like `dist/`) while maximizing parallelism elsewhere, without requiring users to manually partition their build.
- **Watchers (Future / Watch Mode):** Future versions may use filesystem watchers (e.g. @parcel/watcher) combined with process tree tracking to passively detect undeclared reads and writes.

### 3.13 Configuration System

MiniShake avoids static JSON/YAML files for its own configuration. Instead, configuration is defined directly in `t2lang`, allowing dynamic computation while maintaining structure.

**Philosophy:**
1.  **Code-First:** Configuration is code. No `minishake.json`.
2.  **Global Defaults:** A top-level `(config ...)` block sets defaults for the entire program.
3.  **Local Shadowing:** Individual rules can override specific keys; these overrides merge with the global config.
4.  **Rich Values:** Values can be primitives, lists, or nested objects.

**Example usage:**

```lisp
(program
  (macro-import minishake "minishake")

  ;; 1. Global Configuration
  (config
    (output_dir "dist")
    (log_level "info")
    (tools (object (tsc "5.3") (esbuild "0.19"))))

  (rule build-backend
    (caps (run tsc))
    ;; 2. Local Shadowing: overrides global output_dir via argument or let-binding
    (async-lambda ()
      ;; 3. Accessing Config
      (let (out (config.get "output_dir"))
           (run.tsc :outDir out)))))
```

All accessed configuration values become part of the rule's input hash. Changing a global config value essentially invalidates all rules that depend on it (or don't shadow it).

**Static Typing Strategy:**
-   **MVP:** Users are encouraged to define a configuration interface (e.g. `(interface Config (out_dir string))`) to get type safety within rules.
-   **Post-MVP (Auto-Typing):** To reduce toil, MiniShake can observe the actual runtime types of configuration values during a build (using `typeof`, `instanceof`, etc.) and automatically insert the corresponding type annotations back into `build.shk`. This "learning mode" keeps the config strictly typed without requiring manual maintenance.

### 3.14 Package Dependencies: Not MiniShake's Job

MiniShake is a build system, not a package manager. It deliberately does not resolve, fetch, or lay out npm packages. Version resolution stays with the package manager the user already has.

**Why MiniShake does not replace `package-lock.json`:**

The JavaScript package ecosystem is uniquely complex. A package manager must handle semver range parsing and intersection, `peerDependencies` (whose semantics have changed across npm 3/6/7/8), `optionalDependencies` (silent install failures), `bundledDependencies`, `overrides` / `resolutions` (user-specified graph mutations to fix irreconcilable transitive conflicts), `--legacy-peer-deps` (disabling an entire constraint class because enforcing it breaks real-world packages), platform-conditional optional deps (`os`, `cpu`, `libc` fields), postinstall scripts (arbitrary code execution during resolution), `.npmrc` configuration (registries, auth tokens, proxies), and workspace hoisting rules.

These features exist because transitive dependency graphs routinely have conflicting version constraints that no algorithm can automatically satisfy — the "correct" resolution is sometimes a human judgment call. npm, pnpm, and Yarn each have full-time teams maintaining this. It is not work MiniShake should duplicate.

**What MiniShake does instead:**

MiniShake treats the *output* of package management as input to the build graph:

1. **Lockfile as a source node.** The lockfile (`pnpm-lock.yaml`, `package-lock.json`, etc.) is a source node in the graph. Any rule that depends on packages from `node_modules` declares a dependency on the lockfile. If the lockfile hash changes, those rules are stale. This is the same approach Bazel's `rules_js` uses.

2. **Undeclared `node_modules` access detection.** If a rule (or a tool it invokes) reads files from `node_modules` without declaring a lockfile dependency, MiniShake's discrepancy detection (Stage 5) flags it as a hermeticity leak.

3. **Tool content hashing.** `tool:tsc` hashes the actual output of `tsc --version`, not a version string from `package.json`. If someone runs `npm install` and a tool binary changes, the hash changes, the rule is stale. This catches silent upgrades that a version string alone would miss.

4. **Environment validation.** The build graph's environment snapshot (Section 3.1) catches platform/arch changes that would affect `node_modules` resolution (native modules, optional deps) without MiniShake needing to understand the resolution algorithm itself.

**Recommended package manager: pnpm.**

MiniShake recommends [pnpm](https://pnpm.io/) for projects that want the strongest correctness guarantees:

- **Content-addressable global store** — every file in every package version is stored once, deduplicated by content hash. This is the same philosophy as MiniShake's build graph.
- **Strict `node_modules` isolation** — packages can only access their declared dependencies, preventing phantom dependency bugs that npm's flat hoisting silently allows.
- **Bazel compatibility** — Bazel's `rules_js` reads `pnpm-lock.yaml` directly. If a project ever needs Bazel-level hermeticity, pnpm is the natural bridge.

MiniShake works with any package manager. The recommendation is not a requirement.

---

## 4. Caching

### 4.1 Local cache

Caching is local, content-addressed by input hash.

```
.shk/cache/<hash>/
```

Each cache entry contains the output artifacts and a manifest. On rule evaluation:
1. Compute input hash
2. Check if `.shk/cache/<hash>/` exists
3. If yes: restore outputs, log cache hit, skip execution
4. If no: execute rule, write outputs to cache keyed by hash, log cache miss

### 4.2 What goes in the input hash

The input hash for a rule is the aggregate of the content hashes of all its dependency nodes in the build graph:
- **File nodes** — content hashes of all files the rule depends on (resolved by compiler API / metafile for TS and esbuild rules; glob-expanded for others)
- **Capability declarations** — the structural shape of the rule's declared capabilities
- **Capability values** — resolved runtime values (e.g. actual env var values at evaluation time)
- **Rule output nodes** — transitive output hashes from rules reached via `need`
- **Toolchain nodes** — `toolchain:tsc`, `toolchain:esbuild`, `toolchain:node` version hashes
- **Config nodes** — `config:tsconfig`, `config:eslint`, etc. content hashes

**Note:** Both the capability *names* and the capability *values* contribute to the hash. This is non-obvious but load-bearing. Adding a capability declaration changes the hash. Changing the value of a declared env var changes the hash. Neither should be suppressed.

### 4.3 Cache eviction

LRU eviction up to 1000 entries (hardcoded for MVP). `shk cache clean` available for manual eviction.

---

## 5. Pre-MVP: Logging-First MiniShake

Bootstrap stage. MiniShake doesn't need full caching or correctness yet — just enough to run rules and log everything.

### 5.1 Goals

- Working `shk` CLI that loads `build.shk`, evaluates rules, and logs all activity to `.shk/`
- MiniShake's own repo uses this from day one
- Establish `.shk/` as a visible, valuable artifact
- Prove the logging story early

### 5.2 Pre-MVP capabilities

**Minimal rule engine**
- Rule registry
- `need` to call other rules
- Simple non-cached evaluation (always re-run)
- No hashing yet

**Dependency tracking**
- Manual explicit capability declarations — developer declares globs, env vars, tools
- No compiler API, no metafile
- Cache correctness is the developer's responsibility
- The value proposition at this stage is visibility, not correctness

**t2 `build.shk` loader**
- Parse `build.shk` (t2 syntax)
- Register rules in a runtime registry

**Logging subsystem**

Global event emitter for: `rule-start`, `rule-end`, `file-read`, `file-write`, `command-run`, `dep-edge`

Written to `.shk/logs/run-<timestamp>.jsonl`. Example:
```json
{"type":"rule-start","rule":"build-prod","time":"2026-03-12T23:10:00Z"}
{"type":"file-read","rule":"build-ts","path":"src/index.ts"}
{"type":"command-run","rule":"build-prod","cmd":"esbuild","args":["src/index.ts","--minify"]}
{"type":"dep-edge","from":"build-prod","to":"build-ts"}
{"type":"rule-end","rule":"build-prod","time":"2026-03-12T23:10:02Z"}
```

**Graph generation**

`shk graph` reads last run's logs and emits `graph/last-run.mmd` (mermaid).

**`.shk/` directory layout (pre-MVP)**
```
.shk/
  logs/
    run-2026-03-12T23-10-00.jsonl
  graph/
    build-graph.json          # persisted build graph (nodes, edges, hashes)
    last-run.mmd              # mermaid visualization
```

**Git integration**

MiniShake's own repo commits `.shk/logs/` and `.shk/graph/`, making it the poster child for committed logs.

### 5.3 Pre-MVP build tooling

MiniShake itself is built via a plain Node script or `package.json` during pre-MVP and MVP. Self-hosting (`build.shk` building MiniShake itself) is a post-MVP milestone.

---

## 6. Stages Toward MVP

### Stage 1: Basic dependency tracking and caching

- Track files read via `fs.*`, rules depended on via `need`, commands run via `run.*`
- Compute input hash (file contents, transitive rule hashes, capability declarations and values)
- Store input hash + output summary in cache
- On next run: cache hit → skip, cache miss → run
- Log cache hits and misses

### Stage 2: Toolchain and config hashing

- Add `toolchain:tsc`, `toolchain:esbuild`, `toolchain:node` rules
- Add `config:tsconfig`, `config:esbuild`, `config:eslint` rules
- Rules that use these tools call `need` on them; their hashes become part of the input hash

### Stage 3: Cross-platform FS/OS SDK

- Implement `fs.read`, `fs.write`, `fs.remove`, `fs.copy`, `fs.glob`, `fs.hash`
- Implement `run.command`, `run.node`, `run.tsc`, `run.esbuild`
- All backed by Node's `fs`, `path`, `child_process`, `crypto`
- No direct shell commands in `build.shk`

### Stage 4: JS ecosystem integration (MVP level)

**TypeScript pipeline (required for MVP correctness)**
- `build-ts` rule using `run.tsc`
- Dependency graph via TypeScript compiler API — replaces glob-based file tracking
- Compiler API integration is version-pinned to the declared `toolchain:tsc`
- Hashes the resolved file set, not a glob expansion

**esbuild pipeline**
- `bundle-app` rule using `run.esbuild`
- Dependency graph via esbuild metafile (`metafile: true`)
- First run always executes; subsequent runs use stored metafile to detect input changes
- Depends on `build-ts` outputs, bundler config, `toolchain:esbuild`

**Asset pipeline**
- `build-assets` rule using `fs.glob` and `fs.copy`
- Glob-based tracking (appropriate for assets)

At this point MiniShake can build a non-trivial TypeScript app with incremental, cached, portable builds.

---

## 7. Stages Beyond MVP

### Stage 5: Discrepancy detection & "Declared-Input" Verification

MiniShake acknowledges that tools (like `tsc` or `node`) can read files or access the network behind the build system's back. To close this loop without full OS sandboxing, MiniShake shifts the responsibility to verification.

**The "Strict Declaration" Contract:**
Cache correctness relies entirely on the input hash. If a rule reads `/dev/random` or `~/.ssh/config` without declaring it, the hash is incomplete, and caching is broken.

**Verification Tooling (`--warn-implicit-inputs`):**
MiniShake will implement runtime tracing (via Node.js loader hooks or OS-level `strace`/eBPF where possible) to observe the *actual* resource usage of a rule + its child processes.

- **Filesystem:** Compare actual file `open()` calls against declared `fs.read` globs.
- **Environment:** Compare actual `getenv()` calls against declared `env` keys.
- **Network:** Detect undeclared socket connections (which should generally be banned).

**Outcome:**
Any resource accessed but not declared is flagged as a "Hermeticity Leak."
- **MVP:** Log warnings (`WARN: Rule 'build' read undeclared file 'config.local.json'`).
- **Strict Mode:** Fail the build.

This transforms hermeticity from a runtime enforcement problem (hard) to a discrepancy detection problem (traceable).

### Stage 5.5: Runtime Sandboxing (Experimental)

While linting (Appendix A) catches static violations, runtime sandboxing attempts to enforce the SDK boundary by patching `fs`, `child_process`, and `process` within the rule execution context.

- **Goal:** Throw errors or log warnings if a rule (or a library it uses) attempts to read/write files or spawn processes without using the MiniShake SDK (and thus bypassing the hash).
- **Challenge:** Node.js is not a secure sandbox. This approach is inherently leaky (native modules, sneaky globals) but serves as a valuable defense-in-depth "seatbelt" alongside static linting.
- **Status:** To be researched. If viable, it moves MiniShake closer to true hermeticity without the operational cost of containerization.

### Stage 6: Temporal nondeterminism detection

- `.shk/history/` — per-rule input hash, output hash, timestamps
- If input hash same but output hash differs: classify nondeterminism (timestamps, IDs, ordering)
- `--warn-nondeterministic-rule`
- Allow suppression of known benign nondeterminism (source map timestamps, `.tsbuildinfo` noise)

### Stage 7: Rich debugging and introspection

- `--verbose` — why a rule ran, what it read/wrote, what commands ran, what hashes were used
- `shk graph` — mermaid output, JSON graph for tools
- `shk explain <rule>` — "This rule ran because X changed, which depends on Y, which depends on Z."

### Stage 8: Self-hosting (MVP+)

MiniShake builds itself via `build.shk`. This is a meaningful public milestone signaling system maturity. The bootstrapping dependency chain during pre-MVP and MVP uses a plain Node build script.

### Stage 9: Ecosystem expansion

- Vite, Rollup, SWC, Bun
- Test runners (Vitest, Jest)
- CSS pipelines (PostCSS, Tailwind)
- Watch mode / HMR (deferred; may require significant rework)
- Optional remote cache

---

## 8. Summary

**Pre-MVP:** Minimal rule engine, t2 `build.shk`, logging as first-class feature, `.shk/logs/` and `.shk/graph/` committed in MiniShake's own repo.

**MVP:** Shake-like dependency tracking, hash-based caching (local, LRU-1000), capability model with progressive enforcement, TypeScript compiler API for correct TS dependency tracking, esbuild metafile for bundling, cross-platform FS/OS SDK.

**Post-MVP:** Discrepancy detection, temporal nondeterminism detection, rich debugging and introspection, self-hosting, ecosystem expansion.

**The through-line:** MiniShake manages a build graph. Every artifact is a node; every dependency is an edge; every node knows its own hash. You say "build X" and MiniShake walks the graph backward, rebuilding only what's stale. The TypeScript compiler API and esbuild metafile aren't just hashing mechanisms — they're graph-building tools that discover the real edges between your files. t2 projects inherit this automatically, since t2 transpiles to TypeScript. MiniShake is the "red pill" for JS builds: you keep thinking in scripts, but you get a precise, explainable, incremental, content-addressed build graph — with logs that tell the whole story.

---

## Appendix A: Lint Rules

These lint rules enforce the SDK boundary. All are statically checkable via t2's compiler or macro system.

**Environment access**
- Disallow `process.env.*` direct property access — use `env.get`
- Disallow `process.env[expr]` dynamic access

**Filesystem**
- Disallow Node `fs.*` direct access — use MiniShake's `fs.*`
- Disallow `path.resolve` with absolute paths (portability)
- Disallow `__dirname` and `__filename` — use MiniShake path utilities
- Disallow `import.meta.url` for path construction

**Process / execution**
- Disallow `child_process.exec`, `spawn`, `execSync` etc. — use `run.command`
- Disallow `process.exit` inside rules
- Disallow `process.cwd()` — should come from MiniShake's path context

**Nondeterminism**
- Warn on `Date.now()` or `new Date()` inside rules
- Warn on `Math.random()` inside rules
- Warn on `crypto.randomUUID()` and similar

**Network**
- Warn on any `fetch`, `http`, `https` calls inside rules — network access is outside the current capability model

**Module system**
- Warn on dynamic `import()` inside rules — statically unanalyzable dependencies
- Warn on `require()` calls — same reason

Note: `net.*` is a planned future capability namespace for when remote caching or registry access is added. The namespace is reserved now for consistency with `fs.*`, `env.*`, `run.*`.
