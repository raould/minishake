// build.ts — MiniShake build rules for the example project.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export default function (shk) {
    shk.rule({
        name: "compile",
        output: "dist/uses.js",
        deps: [
            { kind: "file", path: "src/core.ts" },
            { kind: "file", path: "src/uses.ts" },
            { kind: "tool", name: "tsc" },
        ],
        action: (ctx) => __awaiter(this, void 0, void 0, function* () {
            yield ctx.run("./node_modules/.bin/tsc", ["--project", "tsconfig.json"]);
        }),
    });
}
//# sourceMappingURL=build.js.map