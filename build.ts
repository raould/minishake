// build.ts — MiniShake self-hosting build file.
// Defines the rules for MiniShake to build itself from src/*.t2.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export default function (shk: any) {
  shk.rule({
    name: "t2-compile",
    output: "build/ts/cli.ts", // representative output
    deps: [
      { kind: "glob", pattern: "src/**/*.t2" },
      { kind: "tool", name: "t2tc" },
    ],
    action: async (ctx: any) => {
      const srcDir = path.join(ctx.projectRoot, "src");
      const outDir = path.join(ctx.projectRoot, "build", "ts");

      // Step 1: compile each .t2 → .ts
      const t2Files = readdirSync(srcDir).filter((f: string) =>
        f.endsWith(".t2")
      );
      for (const f of t2Files) {
        const src = path.join(srcDir, f);
        await ctx.run("./node_modules/.bin/t2tc", [src, "--outDir", outDir]);
      }

      // Step 2: fix import paths (.t2 → .js)
      const tsDir = path.join(ctx.projectRoot, "build", "ts");
      const tsFiles = readdirSync(tsDir).filter((f: string) =>
        f.endsWith(".ts")
      );
      for (const f of tsFiles) {
        const filePath = path.join(tsDir, f);
        let content = readFileSync(filePath, "utf-8");
        content = content.replace(/from "(\.\/[^"]+)\.t2"/g, 'from "$1.js"');
        writeFileSync(filePath, content);
      }
    },
  });

  shk.rule({
    name: "ts-compile",
    output: "dist/cli.js", // representative output
    deps: [
      { kind: "rule", name: "t2-compile" },
      { kind: "file", path: "tsconfig.json" },
      { kind: "tool", name: "tsc" },
    ],
    action: async (ctx: any) => {
      await ctx.run("./node_modules/.bin/tsc", ["--project", "tsconfig.json"]);
    },
  });
}
