import { pathToFileURL } from "node:url";
import path from "node:path";
import type { PosixPath } from "./paths.js";
import type { Rule, Dep } from "./rule.js";
const dynamicImport  = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;
export class RuleCollector {
  rules: Rule[] = [];
  rule(def: Rule): void {
    if (this.rules.some(function(r: Rule) {
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
export const loadBuildFile = async function(filePath: string, projectRoot: string) {
  const absPath: string = path.resolve(projectRoot, filePath);
  const fileUrl: string = pathToFileURL(absPath).toString();
  const mod: any = (await dynamicImport(fileUrl));
  const collector  = new RuleCollector();
  if ((!mod.default)) {
    throw new Error((("build file " + filePath) + " must export a default function"));
  }
  (await mod.default(collector));
  return collector.rules;
};
