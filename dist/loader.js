import { pathToFileURL } from "node:url";
import path from "node:path";
const dynamicImport = new Function("specifier", "return import(specifier)");
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
export const loadBuildFile = async function (filePath, projectRoot) {
    const absPath = path.resolve(projectRoot, filePath);
    const fileUrl = pathToFileURL(absPath).toString();
    const mod = (await dynamicImport(fileUrl));
    const collector = new RuleCollector();
    if ((!mod.default)) {
        throw new Error((("build file " + filePath) + " must export a default function"));
    }
    (await mod.default(collector));
    return collector.rules;
};
//# sourceMappingURL=loader.js.map