import { writeFileSync, existsSync, unlinkSync, symlinkSync } from "node:fs";
import path from "node:path";
import os from "node:os";
interface FsProbes  { caseSensitive: boolean; unicodeNormalization: boolean; symlinkSupport: boolean }
interface OsInfo  { platform: string; arch: string; release: string; endianness: string }
interface PathInfo  { sep: string; delimiter: string }
interface NodeInfo  { version: string; versions: Record<string, string> }
interface BuildEnvironment  { fs: FsProbes; os: OsInfo; path: PathInfo; node: NodeInfo; ci: boolean; createdAt: string }
export { BuildEnvironment, FsProbes, OsInfo, PathInfo, NodeInfo };
function probeCaseSensitivity(dir: string): boolean {
  const probe: string = path.join(dir, ("_shk_case_" + process.pid));
  try {
    writeFileSync(probe, "");
    const exists: boolean = existsSync(probe.toUpperCase());
    return (!exists);
  }
  finally {
    try {
      unlinkSync(probe);
    }
    catch (e) {
      undefined;
    }
  }
}
function probeUnicodeNormalization(dir: string): boolean {
  const nfcPath: string = path.join(dir, ("_shk_u00e9_" + process.pid));
  const nfdPath: string = path.join(dir, ("_shk_eu0301_" + process.pid));
  try {
    writeFileSync(nfcPath, "");
    return existsSync(nfdPath);
  }
  finally {
    try {
      unlinkSync(nfcPath);
    }
    catch (e) {
      undefined;
    }
  }
}
function probeSymlinks(dir: string): boolean {
  const target: string = path.join(dir, ("_shk_symtgt_" + process.pid));
  const link: string = path.join(dir, ("_shk_symlink_" + process.pid));
  try {
    writeFileSync(target, "");
    symlinkSync(target, link);
    return true;
  }
  catch (e) {
    return false;
  }
  finally {
    try {
      unlinkSync(link);
    }
    catch (e) {
      undefined;
    }
    try {
      unlinkSync(target);
    }
    catch (e) {
      undefined;
    }
  }
}
export function probeEnvironment(projectDir: string): BuildEnvironment {
  const fsProbes  = ({
    caseSensitive: probeCaseSensitivity(projectDir),
    unicodeNormalization: probeUnicodeNormalization(projectDir),
    symlinkSupport: probeSymlinks(projectDir)
  });
  const osInfo  = ({
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    endianness: os.endianness()
  });
  const pathInfo  = ({
    sep: path.sep,
    delimiter: path.delimiter
  });
  const nodeInfo  = ({
    version: process.version,
    versions: Object.assign(({
      
    }), process.versions)
  });
  return ({
    fs: fsProbes,
    os: osInfo,
    path: pathInfo,
    node: nodeInfo,
    ci: (!(!process.env.CI)),
    createdAt: new Date().toISOString()
  });
}
export function validateEnvironment(stored: BuildEnvironment, current: BuildEnvironment): void {
  const fatal: string[] = [];
  if ((stored.fs.caseSensitive !== current.fs.caseSensitive)) {
    fatal.push(((("filesystem case sensitivity changed: " + stored.fs.caseSensitive) + " → ") + current.fs.caseSensitive));
  }
  if ((stored.fs.unicodeNormalization !== current.fs.unicodeNormalization)) {
    fatal.push(((("filesystem unicode normalization changed: " + stored.fs.unicodeNormalization) + " → ") + current.fs.unicodeNormalization));
  }
  if ((stored.os.platform !== current.os.platform)) {
    fatal.push(((("OS platform changed: " + stored.os.platform) + " → ") + current.os.platform));
  }
  if ((fatal.length > 0)) {
    console.error("BUILD HALTED — persisted graph is incompatible with current environment:");
    for (const msg of fatal) {
      console.error(("  " + msg));
    }
    console.error("Run `shk clean` to discard the graph and rebuild from scratch.");
    process.exit(1);
  }
  if ((stored.os.arch !== current.os.arch)) {
    console.warn(((("warning: architecture changed: " + stored.os.arch) + " → ") + current.os.arch));
  }
  if ((stored.node.version !== current.node.version)) {
    console.warn(((("warning: Node.js version changed: " + stored.node.version) + " → ") + current.node.version));
  }
  if ((stored.fs.symlinkSupport !== current.fs.symlinkSupport)) {
    console.warn(((("warning: symlink support changed: " + stored.fs.symlinkSupport) + " → ") + current.fs.symlinkSupport));
  }
}
