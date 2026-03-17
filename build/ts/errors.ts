export class BuildError extends Error {
  nodeId: string;
  tool: string;
  detail: string;
  constructor(nodeId: string, tool: string, detail: string) {
    super(((((("rule " + nodeId) + " failed: ") + tool) + " — ") + detail));
    this.name = "BuildError";
    this.nodeId = nodeId;
    this.tool = tool;
    this.detail = detail;
  }
}
export class CycleError extends Error {
  cyclePath: string[];
  constructor(message: string, cyclePath: string[]) {
    super(((message + ": ") + cyclePath.join(" → ")));
    this.name = "CycleError";
    this.cyclePath = cyclePath;
  }
}
export function collectCyclePath(visiting: Set<string>, nodeId: string): string[] {
  const result: string[] = [];
  let found: boolean = false;
  visiting.forEach(function(id: string) {
    if ((found || (id === nodeId))) {
      found = true;
      result.push(id);
    }
  });
  result.push(nodeId);
  return result;
}
