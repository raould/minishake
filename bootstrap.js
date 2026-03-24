#!/usr/bin/env node
// bootstrap.js — Stage 0 seed build. No MiniShake dependency.
// Compiles src/*.t2 → build/ts/*.ts → dist/*.js + dist/*.d.ts
// using only the t2 compiler (from t2lang dep) and tsc.

import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT     = import.meta.dirname;
const SRC      = path.join(ROOT, "src");
const BUILD_TS = path.join(ROOT, "build", "ts");
const T2TC     = path.join(ROOT, "node_modules", ".bin", "t2tc");

// Step 1: t2 → TypeScript
console.log("Stage 0: compiling t2 → TypeScript...");
mkdirSync(BUILD_TS, { recursive: true });
const t2Files = readdirSync(SRC).filter(f => f.endsWith(".t2"));
for (const f of t2Files) {
  const src = path.join(SRC, f);
  console.log(`  ${f}`);
  execFileSync(T2TC, [src, "--outDir", BUILD_TS], {
    stdio: "inherit",
  });
}

// Step 1.5: Fix import paths in generated TypeScript.
// The t2 compiler emits `import type { X } from "./foo.t2"` but TypeScript
// with nodenext resolution needs `.js` extensions for runtime imports.
// Also fix `export { Type }` → `export type { Type }` for type-only re-exports.
console.log("Stage 0: fixing import paths...");
const tsFiles = readdirSync(BUILD_TS).filter(f => f.endsWith(".ts"));
for (const f of tsFiles) {
  const filePath = path.join(BUILD_TS, f);
  let content = readFileSync(filePath, "utf-8");
  // Fix .t2 extensions in import type statements → .js
  content = content.replace(/from "(\.\/[^"]+)\.t2"/g, 'from "$1.js"');
  writeFileSync(filePath, content);
}

// Step 2: TypeScript → JavaScript
console.log("Stage 0: compiling TypeScript → JavaScript...");
execFileSync("npx", ["tsc", "--project", "tsconfig.json"], {
  cwd: ROOT,
  stdio: "inherit",
});

console.log("Stage 0 bootstrap complete: dist/ ready");
