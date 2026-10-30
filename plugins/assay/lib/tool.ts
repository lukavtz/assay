import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import {
  coverageGap,
  duplicateLines,
  mutationOutcome,
  remediation,
  tail,
  worstRows,
  type Check,
  type RunResult,
} from "./report.ts";
import { confinedTargets } from "./targets.ts";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENV = join(PLUGIN_ROOT, ".venv");
const IS_WINDOWS = process.platform === "win32";
const PYTHON = IS_WINDOWS ? join(VENV, "Scripts", "python.exe") : join(VENV, "bin", "python");
const VENDOR = join(PLUGIN_ROOT, "vendor");

type Params = {
  paths?: string;
  threshold?: number;
  coverage?: "run" | "existing" | "skip";
  duplication?: boolean;
  mutation?: "off" | "scan" | "run";
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
    paths: pi.zod.string().describe("Comma-separated files or directories to measure, for example \"src, tests\". Use \"\" for changed files only."),
    threshold: pi.zod.number().describe("Maximum CRAP score per function. Use 10."),
    coverage: pi.zod.enum(["run", "existing", "skip"]).describe("run: execute tests. existing: reuse reports. skip: complexity only."),
    duplication: pi.zod.boolean().describe("Report structural duplicate candidates."),
    mutation: pi.zod.enum(["off", "scan", "run"]).describe("off: skip. scan: list sites. run: execute mutants."),
  }),

  async execute(_toolCallId, params: Params, signal, onUpdate, ctx) {
    const project = ctx?.cwd ?? process.cwd();
    const progress = (text: string) => onUpdate?.({ content: [{ type: "text", text }] });
    const threshold = params.threshold ?? 10;
    const coverage = params.coverage ?? "run";
    const duplication = params.duplication ?? true;
    const mutationMode = params.mutation ?? "off";
    const selected = (params.paths ?? "")
      .split(",")
      .map(path => path.trim())
      .filter(Boolean);
    const targets = selected.length > 0 ? confinedTargets(project, selected) : ["--changed"];

    await ensureVenv(pi, progress, signal);

    const coverageFlag =
      coverage === "skip" ? ["--no-coverage"] : coverage === "existing" ? ["--use-existing-coverage"] : [];
    progress("crapper + dryer: measuring…");
    const [crap, dryRun] = await Promise.all([
      run(pi, PYTHON, ["-m", "crapper", "--threshold", String(threshold), ...coverageFlag, ...targets], project, signal),
      duplication ? run(pi, PYTHON, ["-m", "dryer", "--min-lines", "3", ...targets], project, signal) : Promise.resolve(null),
    ]);

    const missingCoverage = coverage === "run" ? coverageGap(crap.stderr) : "";
    const crapCheck: Check = {
      ok: crap.code === 0,
      exit: crap.code,
      note: crap.code === 0 ? "" : missingCoverage || `CRAP above ${threshold}`,
    };

    let dryCheck: Check = { ok: true, exit: 0, note: "skipped" };
    let dryText = "";
    if (dryRun) {
      const report = await readReport(join(project, ".metrics", "dry.edn"));
      const count = (report.match(/:score/g) ?? []).length;
      const clean = dryRun.code === 0 && count === 0;
      dryCheck = { ok: clean, exit: dryRun.code, note: clean ? "no candidate" : `${count} candidate(s) at ≥ 0.82` };
      dryText = duplicateLines(dryRun.stdout);
    }

    let mutationCheck: Check = { ok: true, exit: 0, note: "skipped" };
    let mutationText = "";
    if (mutationMode !== "off") {
      progress(`mutator: ${mutationMode === "scan" ? "listing sites…" : "executing mutants, this can take a while…"}`);
      const args = ["-m", "mutator", ...(mutationMode === "scan" ? ["--scan"] : []), ...targets];
      const result = await run(pi, PYTHON, args, project, signal);
      mutationCheck = mutationOutcome(mutationMode, result);
      mutationText = tail(result.stdout || result.stderr, 12);
    }

    const checks = { crap: crapCheck, duplication: dryCheck, mutation: mutationCheck };
    const ok = Object.values(checks).every(check => check.ok);
    const reason = Object.entries(checks)
      .filter(([, check]) => !check.ok)
      .map(([name, check]) => `${name}: ${check.note}`)
      .join("; ");

    const record = {
      ok,
      stamp: new Date().toISOString(),
      cwd: project,
      threshold,
      coverage,
      reason,
      checks,
      worst: worstRows(crap.stdout),
    };
    const recordPath = await metricsPath(project, "assay.json");
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const text = [
      ok ? "assay: PASS" : `assay: FAIL — ${reason}`,
      "",
      `crapper   exit ${crapCheck.exit}  threshold ${threshold}${crapCheck.note ? `  (${crapCheck.note})` : ""}`,
      worstRows(crap.stdout) || "(no scored functions)",
      "",
      `dryer     ${dryCheck.note}`,
      dryText,
      "",
      `mutator   ${mutationCheck.note}`,
      mutationText,
      "",
      ok ? "Next: commit." : remediation(checks, coverage),
      "Wrote .metrics/assay.json",
    ]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd();

    return {
      content: [{ type: "text", text }],
      details: record,
      isError: !ok,
    };
  },
  };
}

async function metricsPath(project: string, name: string): Promise<string> {
  const directory = join(project, ".metrics");
  await mkdir(directory, { recursive: true });
  const dirInfo = await lstat(directory);
  if (dirInfo.isSymbolicLink()) {
    throw new Error("assay: .metrics is a symbolic link; refusing to write the record through it.");
  }
  const target = join(directory, name);
  const existing = await lstat(target).catch(() => null);
  if (existing?.isSymbolicLink()) {
    throw new Error(`assay: .metrics/${name} is a symbolic link; refusing to write through it.`);
  }
  return target;
}

async function readReport(path: string): Promise<string> {
  const info = await lstat(path).catch(() => null);
  if (!info || info.isSymbolicLink() || !info.isFile()) return "";
  return readFile(path, "utf8").catch(() => "");
}

async function run(
  pi: ExtensionAPI,
  command: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<RunResult> {
  const timeout = AbortSignal.timeout(15 * 60_000);
  const combined = signal && typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : timeout;
  const result = await pi.exec(command, args, { cwd, signal: combined });
  return { code: result.code, stdout: cap(result.stdout ?? ""), stderr: cap(result.stderr ?? "") };
}

function cap(text: string): string {
  return text.length > 200_000 ? `${text.slice(0, 200_000)}\n…truncated by assay` : text;
}

/** A working `python` on PATH is not guaranteed, and `py -3` is the Windows launcher. */
async function pickPython(): Promise<string[]> {
  const override = process.env.ASSAY_PYTHON;
  if (override) return [override];
  const candidates: string[][] = IS_WINDOWS ? [["py", "-3"], ["python"], ["python3"]] : [["python3"], ["python"]];
  for (const candidate of candidates) {
    const probe = await spawn(candidate[0], [...candidate.slice(1), "-c", "import sys;print(sys.version_info[0])"], PLUGIN_ROOT);
    if (probe.code === 0 && probe.stdout.trim() === "3") return candidate;
  }
  throw new Error("assay: no Python 3 interpreter found. Set ASSAY_PYTHON to its absolute path.");
}

async function ensureVenv(pi: ExtensionAPI, onUpdate: (text: string) => void, signal?: AbortSignal) {
  if (existsSync(PYTHON)) {
    const probe = await spawn(PYTHON, ["-c", "import crapper, dryer, mutator"], PLUGIN_ROOT, signal);
    if (probe.code === 0) return;
    onUpdate("assay: the measurement virtualenv is incomplete; rebuilding…");
    await rm(VENV, { recursive: true, force: true });
  }
  const python = await pickPython();
  onUpdate("assay: creating the measurement virtualenv (first run only)…");
  const created = await spawn(python[0], [...python.slice(1), "-m", "venv", VENV], PLUGIN_ROOT, signal);
  if (created.code !== 0) {
    throw new Error(
      `assay: could not create a virtualenv with ${python.join(" ")}. Set ASSAY_PYTHON to a Python 3.11+ interpreter.\n${created.stderr}`,
    );
  }
  onUpdate("assay: installing crapper, dryer and mutator…");
  const install = await spawn(
    PYTHON,
    [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "-q",
      "-e",
      join(VENDOR, "crapper"),
      "-e",
      join(VENDOR, "dryer"),
      "-e",
      join(VENDOR, "mutator"),
    ],
    PLUGIN_ROOT,
    signal,
  );
  if (install.code !== 0) {
    throw new Error(`assay: dependency install failed.\n${install.stderr || install.stdout}`);
  }
}

async function spawn(command: string, args: string[], cwd: string, signal?: AbortSignal): Promise<RunResult> {
  let proc;
  try {
    proc = Bun.spawn([command, ...args], { cwd, stdout: "pipe", stderr: "pipe", signal });
  } catch (error) {
    return { code: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
  }
  const out = proc.stdout;
  const err = proc.stderr;
  if (!(out instanceof ReadableStream) || !(err instanceof ReadableStream)) {
    return { code: 127, stdout: "", stderr: "assay: subprocess pipes are unavailable" };
  }
  const [stdout, stderr, code] = await Promise.all([new Response(out).text(), new Response(err).text(), proc.exited]);
  return { code, stdout, stderr };
}

