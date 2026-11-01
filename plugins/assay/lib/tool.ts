import { lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { analyzeProject, loadCoverage, sourceFiles, type Analysis } from "./engine/project.ts";
import { runMutations, sitesIn } from "./engine/mutate.ts";
import { profileFor } from "./engine/profiles.ts";
import { confinedTargets } from "./targets.ts";
import { duplicateLines, remediation, renderTable, type Check } from "./report.ts";

export type Params = {
  paths?: string;
  threshold?: number;
  coverage?: "run" | "existing" | "skip";
  duplication?: boolean;
  mutation?: "off" | "scan" | "run";
  coverageCommand?: string;
  testCommand?: string;
  maxSites?: number;
};

type Settings = {
  project: string;
  threshold: number;
  coverage: "run" | "existing" | "skip";
  duplication: boolean;
  mutation: "off" | "scan" | "run";
  targets: string[];
  params: Params;
};

export function assayTool(pi: ExtensionAPI) {
  return {
    name: "assay",
    label: "Assay",
    description:
      "Measure code quality the way a lab measures a sample: CRAP per function (threshold 10), structural duplication, optional mutation testing. " +
      "Run it after finishing a change and before committing. Returns pass/fail per check and writes .metrics/assay.json.",
    approval: "exec",
    parameters: pi.zod.object({
      paths: pi.zod.string().describe('Comma-separated files or directories inside the project, for example "src, tests". Use "" for the whole project.'),
      threshold: pi.zod.number().describe("Maximum CRAP score per function, or maximum complexity when coverage is skipped. Use 10."),
      coverage: pi.zod
        .enum(["run", "existing", "skip"])
        .describe("existing: read lcov/coverprofile on disk (default). run: execute coverageCommand first. skip: complexity only."),
      duplication: pi.zod.boolean().describe("Report structural duplicate candidates."),
      mutation: pi.zod.enum(["off", "scan", "run"]).describe("off: skip. scan: list mutation sites. run: execute mutants."),
      coverageCommand: pi.zod.string().optional().describe('Command that writes a coverage report, used when coverage is "run".'),
      testCommand: pi.zod.string().optional().describe('Command that runs the tests, used when mutation is "run".'),
      maxSites: pi.zod.number().optional().describe("Cap on executed mutants. Use 25."),
    }),

    async execute(_toolCallId, params: Params, _signal, onUpdate, ctx) {
      const settings = settingsOf(params, ctx?.cwd ?? process.cwd());
      const progress = (text: string) => onUpdate?.({ content: [{ type: "text", text }] });

      const files = await sourceFiles(settings.project, settings.targets);
      progress(`assay: ${files.length} source file(s)…`);
      const coverage =
        settings.coverage === "skip"
          ? new Map()
          : await loadCoverage(settings.project, settings.coverage === "run", params.coverageCommand);
      const analysis = await analyzeProject(settings.project, files, coverage);

      const checks = {
        crap: crapCheck(analysis, settings.threshold, settings.coverage),
        duplication: duplicationCheck(analysis, settings.duplication),
        mutation: await mutationCheck(settings, files, analysis, progress),
      };
      const ok = Object.values(checks).every(check => check.ok);
      const reason = Object.entries(checks)
        .filter(([, check]) => !check.ok)
        .map(([name, check]) => `${name}: ${check.note}`)
        .join("; ");
      const record = recordOf(settings, analysis, checks, ok, reason);
      await writeFile(await metricsPath(settings.project), `${JSON.stringify(record, null, 2)}\n`, "utf8");

      return {
        content: [{ type: "text", text: renderReport(settings, analysis, checks, ok, reason) }],
        details: record,
        isError: !ok,
      };
    },
  };
}

function settingsOf(params: Params, project: string): Settings {
  const selected = (params.paths ?? "")
    .split(",")
    .map(path => path.trim())
    .filter(Boolean);
  return {
    project,
    threshold: params.threshold ?? 10,
    coverage: params.coverage ?? "existing",
    duplication: params.duplication ?? true,
    mutation: params.mutation ?? "off",
    targets: confinedTargets(project, selected),
    params,
  };
}

/**
 * Without coverage the CRAP formula degenerates into the complexity itself, so
 * skipping coverage still gates complexity — otherwise skip would be a loophole.
 */
function crapCheck(analysis: Analysis, threshold: number, coverage: Settings["coverage"]): Check {
  if (analysis.units.length === 0) return { ok: false, exit: 1, note: "no functions found" };
  const verdict = coverage === "skip" ? complexityVerdict(analysis, threshold) : crapVerdict(analysis, threshold);
  return verdict ?? { ok: false, exit: 1, note: "no coverage data" };
}

function complexityVerdict(analysis: Analysis, threshold: number): Check | undefined {
  const worst = analysis.units.reduce((top, unit) => (unit.complexity > top.complexity ? unit : top));
  const pass = worst.complexity <= threshold;
  return { ok: pass, exit: pass ? 0 : 1, note: pass ? "" : `complexity ${worst.complexity} > ${threshold} in ${worst.name}` };
}

function crapVerdict(analysis: Analysis, threshold: number): Check | undefined {
  const scored = analysis.units.filter(unit => unit.crap !== null);
  if (scored.length === 0) return undefined;
  const worst = scored.reduce((top, unit) => ((unit.crap ?? 0) > (top.crap ?? 0) ? unit : top));
  const value = worst.crap ?? 0;
  const pass = value <= threshold;
  return { ok: pass, exit: pass ? 0 : 1, note: pass ? "" : `CRAP ${value.toFixed(1)} > ${threshold} in ${worst.name}` };
}

function duplicationCheck(analysis: Analysis, enabled: boolean): Check {
  if (!enabled) return { ok: true, exit: 0, note: "skipped" };
  return {
    ok: analysis.duplicates.length === 0,
    exit: analysis.duplicates.length === 0 ? 0 : 1,
    note: analysis.duplicates.length === 0 ? "no candidate" : `${analysis.duplicates.length} candidate(s) at ≥ 0.82`,
  };
}

async function mutationCheck(
  settings: Settings,
  files: string[],
  analysis: Analysis,
  progress: (text: string) => void,
): Promise<Check> {
  if (settings.mutation === "off") return { ok: true, exit: 0, note: "skipped" };
  if (settings.mutation === "scan") return await scanCheck(files);
  return await executeMutants(settings, files, progress);
}

async function scanCheck(files: string[]): Promise<Check> {
  let sites = 0;
  for (const file of files) sites += (await sitesIn(file, await Bun.file(file).text())).length;
  return { ok: true, exit: 0, note: `${sites} site(s)` };
}

async function executeMutants(settings: Settings, files: string[], progress: (text: string) => void): Promise<Check> {
  const command = settings.params.testCommand?.trim() || profileFor(files[0] ?? "")?.testCommand?.join(" ") || "";
  if (!command) return { ok: false, exit: 1, note: "no test command; pass testCommand" };
  progress(`assay: executing mutants (${command})…`);
  const result = await runMutations(settings.project, files, command.split(/\s+/), {
    maxSites: settings.params.maxSites ?? 25,
  });
  const survivors = result.survived.map(site => `line ${site.line} ${site.from}->${site.to}`).join(", ");
  return {
    ok: result.survived.length === 0,
    exit: result.survived.length === 0 ? 0 : 1,
    note: `${result.killed}/${result.sites} killed${result.errored ? `, ${result.errored} errored` : ""}${survivors ? `: ${survivors}` : ""}`,
  };
}

function recordOf(settings: Settings, analysis: Analysis, checks: Record<string, Check>, ok: boolean, reason: string) {
  const worst = analysis.units.reduce((top, unit) => ((unit.complexity ?? 0) > (top.complexity ?? 0) ? unit : top), analysis.units[0]);
  return {
    ok,
    stamp: new Date().toISOString(),
    cwd: settings.project,
    threshold: settings.threshold,
    coverage: settings.coverage,
    files: analysis.files,
    reason,
    checks,
    worst: { name: worst?.name ?? null, complexity: worst?.complexity ?? null, crap: worst?.crap ?? null },
    duplicates: analysis.duplicates.length,
  };
}

function renderReport(settings: Settings, analysis: Analysis, checks: Record<string, Check>, ok: boolean, reason: string): string {
  return [
    ok ? "assay: PASS" : `assay: FAIL — ${reason}`,
    "",
    `files ${analysis.files}   functions ${analysis.units.length}   coverage ${settings.coverage}`,
    renderTable(analysis.units),
    "",
    `duplication  ${checks.duplication.note}`,
    settings.duplication ? duplicateLines(analysis.duplicates) : "",
    "",
    `mutation     ${checks.mutation.note}`,
    "",
    ok ? "Next: commit." : remediation(checks, settings.coverage, analysis.units.length),
    "Wrote .metrics/assay.json",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/** The record drives the commit guard, so it must not be a symlink to somewhere else. */
async function metricsPath(project: string): Promise<string> {
  const directory = join(project, ".metrics");
  await mkdir(directory, { recursive: true });
  if ((await lstat(directory)).isSymbolicLink()) {
    throw new Error("assay: .metrics is a symbolic link; refusing to write the record through it.");
  }
  const target = join(directory, "assay.json");
  const existing = await lstat(target).catch(() => null);
  if (existing?.isSymbolicLink()) {
    throw new Error("assay: .metrics/assay.json is a symbolic link; refusing to write through it.");
  }
  return target;
}