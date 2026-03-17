// build.ts — MiniShake build rules for the example project.

export default function(shk: any) {
  shk.rule({
    name: "compile",
    output: "dist/uses.js",
    deps: [
      { kind: "file", path: "src/core.ts" },
      { kind: "file", path: "src/uses.ts" },
      { kind: "tool", name: "tsc" },
    ],
    action: async (ctx: any) => {
      await ctx.run("./node_modules/.bin/tsc", ["--project", "tsconfig.json"]);
    },
  });
}
