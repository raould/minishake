license: public domain CC0

# MiniShake Design Doc (MVP and Beyond)

**Tagline:** Shake-like tracking, Bazel-like accuracy, t2 scripting, cross-platform SDK, TypeScript-first, with logging as a first-class citizen from day one.

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

- Think in recipes, not graphs
- Use JS/TS/t2, not shell or Starlark
- Run standard tools (tsc, esbuild, test runners)
- Have builds be incremental, cached, and mostly deterministic
- Have good logs, good graphs, and good explanations
- Avoid rewriting their entire project around a build system

### 1.3 MiniShake's core promise

A TypeScript-first, t2-scripted build system that feels like writing scripts, but behaves like a precise, incremental, content-addressed build graph.

- **Shake-like:** demand-driven, dependency-tracked rules
- **Bazel-like:** hashed, toolchain/config aware (within JS scope)
- **Nix-like:** content-addressed, purity-oriented (within JS world)
- **t2-based:** structured, analyzable, scripted in t2 syntax
- **TypeScript-first:** MiniShake's correctness guarantees are strongest for TypeScript (and t2, which transpiles to TypeScript). Pure JavaScript rules receive best-effort tracking only.

And from day one: logging is first-class, committed, and visible in MiniShake's own repo.

### 1.4 Scripting language: t2

MiniShake build files (`build.shk`) are written in t2, an s-expression language with TypeScript semantics that transpiles to TypeScript, which transpiles to JavaScript. Because any JS-targeting language can produce the same runtime surface, MiniShake is in principle scriptable from any such language. t2 is the canonical authoring surface.

t2's macro system (`defmacro`, `macro-time`) is a meaningful asset for build scripting: compile-time glob expansion, config introspection, and dependency inference can be done in macros rather than runtime code, giving MiniShake capabilities that npm scripts and Bazel's Starlark do not have.

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

### 3.1 Core model

**Unit of computation: a rule**
- Defined in `build.shk` (t2 syntax)
- Has a name and an async body
- **Dependencies as arguments:** Capabilities and config are passed as typed arguments, not metadata.
- Returns a value (often a path, artifact, or summary)

**Evaluation model: Shake-style**
- `shk build <rule>` evaluates that rule
- Rules call `(need other-rule)` to depend on each other
- Dependencies are tracked automatically during execution

**Correctness model: "Declared-Input Correctness"**

MiniShake embraces the reality that perfect hermeticity is impossible without OS-level sandboxing (which is slow and complex). Instead, it enforces a contract: **"You strictly declare inputs; we strictly hash them."**

1.  **Responsibility:** The user must explicitly declare all inputs (files, env vars, tools) via capabilities.
2.  **Verification (The Safety Net):** MiniShake provides a `--warn-implicit-inputs` mode (Stage 5) that uses runtime tracing (e.g., `strace` logic or node loader hooks) to detect undeclared filesystem or network access.
3.  **Outcome:** If a tool reads a file `config.json` that wasn't in the declared `fs.read` glob, the build might succeed, but the warning system will flag it as a "hermeticity leak."

Each rule has an input hash derived from:
- File contents (via `fs.*`)
- Capability declarations and their resolved values (see Section 4)
- Toolchain versions (via `toolchain:*` rules)
- Config file contents (tsconfig, bundler configs, eslint, etc.)
- Transitive rule hashes

If input hash unchanged → reuse cached output. If changed → re-run rule.

### 3.2 Capability model

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

### 3.3 Glob performance guidance

Glob expansions are hashed, not the glob pattern itself. This means a broad glob will produce more frequent cache misses as the codebase grows, because any file added, removed, or changed that matches the glob invalidates the rule — even if the rule doesn't care about that file.

**Prefer narrow globs in capability declarations.** `src/core/**/*.ts` will cache more stably than `src/**/*.ts` — a new test file added anywhere under `src/` will invalidate the latter even if the rule doesn't care about test files.

When a rule cache-misses unexpectedly, the first diagnostic question is: is your glob broader than it needs to be? `shk explain <rule>` (Stage 7) will tell you exactly what triggered the cache miss.

### 3.4 TypeScript dependency tracking

Glob-based dependency declarations are a lie for TypeScript: a type change in a deeply imported file can affect a rule that doesn't explicitly declare that file, `node_modules` shifts, `tsconfig.json` path aliases redirect imports non-obviously. MiniShake cannot and does not attempt to fully solve this via globs.

**Instead, MiniShake uses the TypeScript compiler API for TypeScript rules.** Before running a `build-ts` rule, MiniShake invokes the TS compiler API to get the full transitive file dependency graph for the compilation. That exact set of resolved files — not a glob expansion — is hashed as the rule's file input. This is required for MVP correctness; without it, cache behavior for TypeScript projects is too unreliable to be useful.

Implications:
- `toolchain:tsc` (the TypeScript version) is load-bearing in the hash, not just as a version stamp but because a TypeScript upgrade can change module resolution and thus the dependency graph
- The compiler API is not stable across TypeScript versions; the integration must be version-pinned and tested on upgrade
- Pure JavaScript files do not have a comparable API and remain on glob-based tracking with best-effort cache correctness
- **Performance Warning:** Invoking the full TS compiler API for dependency resolution is computationally expensive and slow compared to globs. This is a deliberate trade-off prioritizing correctness over raw speed. Future optimizations (persistent graph caching, SWC-based fast paths) may be required if this becomes a bottleneck.

### 3.5 esbuild dependency tracking

For bundling rules, MiniShake runs esbuild with `metafile: true`. The metafile gives the full input file list, output files, and import relationships for the bundle. This replaces glob-based declarations for esbuild rules, analogously to how the TS compiler API replaces them for TypeScript rules.

Note the slight asymmetry: the TS compiler API provides the dependency graph *before* execution; the esbuild metafile is a *post-execution* artifact. This means:
- The first run of an esbuild rule always executes
- Subsequent runs use the stored metafile to determine if inputs changed
- This is correct behavior, not a bug — document it as a known characteristic

esbuild is the selected MVP bundler. Other bundlers are post-MVP.

### 3.6 t2-based `build.shk` scripting API (MVP shape)

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

**Example:**
```lisp
(program
  (macro-import minishake "minishake")

  (rule build-ts
    (caps (run tsc))
    (async-lambda ()
      (run.tsc)))

  (rule build-assets
    (caps (fs.read "assets/**/*.png") (fs.write "dist/assets"))
    (async-lambda ()
      (fs.copy "assets" "dist/assets" :recursive true)))

  (rule build-prod
    (caps (run esbuild) (env NODE_ENV))
    (async-lambda ()
      (need build-ts)
      (need build-assets)
      (run.esbuild "src/index.ts" :minify true))))
```

### 3.7 Cross-platform FS/OS SDK

Backed by Node's standard library (`fs`, `path`, `child_process`, `crypto`), MiniShake provides portable file operations, command execution, path utilities, and environment utilities. No shell syntax, no OS-specific commands. All operations go through MiniShake's operators — analyzable, portable, and tracked for hashing.

### 3.8 Logging, history, and introspection

From the beginning, MiniShake logs rule evaluations, file reads/writes, command executions, and dependency edges. Stored in `.shk/` as structured machine-readable logs (JSONL, mermaid).

This enables graph visualization, nondeterminism detection, discrepancy detection, and debugging. MiniShake's own repo commits these logs as a living example.

### 3.9 Output Discovery and Scoping

To capture rule outputs without requiring exhaustive file lists:

- **Defined Scope via Capabilities:** Users must predefine output directories via `fs.write` capabilities. Writes outside these directories are ignored.
- **The Concurrency Challenge:** Simple directory diffing (snapshot before/after) fails if multiple rules write to the same directory concurrently.
- **MVP Solution: Exclusive Output Directories:** Rules utilizing directory diffing for output capture **must** write to rule-exclusive directories. To avoid polluting the final artifact, these should be located in a transient location (e.g., `.tmp_dist/<rule-name>/`) rather than the final output folder (`dist/`). A separate "merge rule" then combines these isolated outputs into the final `dist/` structure.
- **Adaptive Concurrency Control (Smart Scheduling):** To support shared output folders without manual partitioning:
    1.  **Learning Phase:** When a rule is new or modified, MiniShake runs it serially (or with strict locking) to observe its actual filesystem footprint.
    2.  **Execution Phase:** The scheduler uses this historical data to automatically parallelize rules with distinct output paths while enforcing serial execution for rules that share output directories.
    3.  **Safety:** This prevents race conditions in shared folders (like `dist/`) while maximizing parallelism elsewhere, without requiring users to manually partition their build.
- **Watchers (Future / Watch Mode):** Future versions may use filesystem watchers (e.g. @parcel/watcher) combined with process tree tracking to passively detect undeclared reads and writes.

### 3.10 Configuration System

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

- File contents for all files in the rule's declared `fs.read` capability globs (hashed as the compiler API / metafile resolved set for TypeScript and esbuild rules respectively)
- Capability declaration names (structural)
- Capability resolved values (e.g. actual env var values at evaluation time)
- Transitive rule hashes
- Toolchain versions (`toolchain:tsc`, `toolchain:esbuild`, `toolchain:node`)
- Config file hashes (`config:tsconfig`, `config:eslint`, etc.)

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
    last-run.mmd
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

**The through-line:** MiniShake is TypeScript-first by necessity, not just preference. The compiler API is what makes cache correctness real for the JS ecosystem. t2 projects inherit this guarantee automatically, since t2 transpiles to TypeScript. MiniShake is the "red pill" for JS builds: you keep thinking in scripts, but you get a precise, explainable, incremental, content-addressed build graph — with logs that tell the whole story.

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
