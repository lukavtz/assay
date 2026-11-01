import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { crapScore, unitsIn, type Unit } from "./analyze.ts";
import { hitsFor, parseGoCover, parseLcov, type LineHits } from "./coverage.ts";
import { findDuplicates, type Duplicate } from "./duplicates.ts";
import { isTestPath, profileFor, SKIP_DIRS } from "./profiles.ts";

export type ScoredUnit = Unit & { coverage: number | null; crap: number | null };

export type Analysis = {
  units: ScoredUnit[];
  duplicates: Duplicate[];
  coverageSources: string[];
  files: number;
};

const LCOV_CANDIDATES = [
  "coverage/lcov.info",
  "coverage/lcov/lcov.info",
  "target/coverage/lcov.info",
  "target/coverage/python/lcov.info",
  "target/coverage/rust/lcov.info",
  "target/coverage/typescript/lcov.info",
  "lcov.info",
];
const GO_CANDIDATES = ["coverage.out", "target/coverage/go/coverage.out"];

export async function sourceFiles(root: string, targets: string[]): Promise<string[]> {
  const found: string[] = [];
  const walk = async (path: string): Promise<void> => {
    const info = await stat(path).catch(() => null);
    if (!info) return;
    if (info.isFile()) {
      const profile = profileFor(path);
      if (profile && !isTestPath(profile, path)) found.push(path);
      return;
    }
    if (!info.isDirectory()) return;
    for (const entry of await readdir(path)) {
      if (SKIP_DIRS[entry]) continue;
      await walk(join(path, entry));
    }
  };
  for (const target of targets.length > 0 ? targets : [root]) await walk(join(root, target));
  return [...new Set(found)].sort();
}

export async function loadCoverage(root: string, run: boolean, command?: string): Promise<Map<string, LineHits>> {
  const files = new Map<string, LineHits>();
  for (const candidate of LCOV_CANDIDATES) {
    const text = await readFile(join(root, candidate), "utf8").catch(() => "");
    for (const [path, hits] of parseLcov(text)) files.set(path, hits);
  }
  for (const candidate of GO_CANDIDATES) {
    const text = await readFile(join(root, candidate), "utf8").catch(() => "");
    for (const [path, hits] of parseGoCover(text)) files.set(path, hits);
  }
  if (run && command) await runCoverage(root, command);
  return files;
}

async function runCoverage(root: string, command: string): Promise<void> {
  const parts = (command.match(/"[^"]*"|\S+/g) ?? []).map(part => part.replace(/^"|"$/g, ""));
  if (parts.length === 0) return;
  const { promise, resolve } = Promise.withResolvers<void>();
  const child = spawn(parts[0], parts.slice(1), { cwd: root, shell: false, stdio: "ignore" });
  child.on("close", () => resolve());
  child.on("error", () => resolve());
  await promise;
}

export async function analyzeProject(
  root: string,
  files: string[],
  coverage: Map<string, LineHits>,
): Promise<Analysis> {
  const units: Unit[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8").catch(() => "");
    if (!source) continue;
    units.push(...(await unitsIn(relative(root, file).split("\\").join("/"), source)));
  }

  const scored: ScoredUnit[] = units.map(unit => {
    const hits = hitsFor(coverage, unit.file);
    if (!hits) return { ...unit, coverage: null, crap: null };
    let instrumented = 0;
    let covered = 0;
    for (const [line, count] of hits) {
      if (line < unit.startLine || line > unit.endLine) continue;
      instrumented += 1;
      if (count > 0) covered += 1;
    }
    const ratio = instrumented === 0 ? 0 : covered / instrumented;
    return { ...unit, coverage: Math.round(ratio * 1000) / 1000, crap: crapScore(unit.complexity, ratio) };
  });

  return {
    units: scored,
    duplicates: findDuplicates(scored),
    coverageSources: [...coverage.keys()],
    files: files.length,
  };
}