import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isToolCallEventType, type ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const COMMIT = /\bgit\b[\s\S]*\bcommit\b/;
const SOURCE = /\.(py|pyi|ts|tsx|mts|cts|js|jsx|mjs|cjs|go|rs|java|clj|cljc|cljs|cljd|bb)$/;
const DAY = 24 * 60 * 60 * 1000;

type AssayRecord = { ok?: boolean; stamp?: string; reason?: string; cwd?: string };
type Verdict = { block: true; reason: string } | undefined;

export default function commitGate(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (process.env.ASSAY_SKIP === "1") return;
    if (!isToolCallEventType("bash", event)) return;
    if (!COMMIT.test(event.input?.command ?? "")) return;
    return await guard(pi, ctx.cwd);
  });
}

async function guard(pi: ExtensionAPI, cwd: string): Promise<Verdict> {
  const recordPath = join(cwd, ".metrics", "assay.json");
  const record = await readRecord(recordPath);
  if (!record) {
    return {
      block: true,
      reason:
        `assay: no gate result at ${recordPath}. Run the assay tool first. ` +
        "Set ASSAY_SKIP=1 only when the gate itself is broken, not when a check fails.",
    };
  }
  const problem = recordProblem(record, cwd) ?? (await stalenessProblem(pi, record.stamp ?? "", cwd));
  return problem ? { block: true, reason: problem } : undefined;
}

async function readRecord(path: string): Promise<AssayRecord | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as AssayRecord;
  } catch {
    return undefined;
  }
}

function recordProblem(record: AssayRecord, cwd: string): string | undefined {
  if (!record.cwd || resolve(record.cwd) !== resolve(cwd)) {
    return "assay: the record was written for another project. Rerun assay.";
  }
  if (record.ok !== true) {
    return `assay: the last gate run failed (${record.reason || "unknown"}). Fix the finding, then rerun assay.`;
  }
  const stamp = Date.parse(record.stamp ?? "");
  const now = Date.now();
  if (!Number.isFinite(stamp) || stamp > now + 60_000 || stamp < now - DAY) {
    return "assay: the gate record has a missing or implausible timestamp. Rerun assay before committing.";
  }
  return undefined;
}

async function stalenessProblem(pi: ExtensionAPI, stamp: string, cwd: string): Promise<string | undefined> {
  const files = await changedSources(pi, cwd);
  if (files === null) {
    return "assay: could not read the working tree with git, so the gate result cannot be trusted. Rerun assay.";
  }
  const since = Date.parse(stamp);
  const touched: string[] = [];
  for (const name of files) {
    if (!SOURCE.test(name)) continue;
    const info = await stat(join(cwd, name)).catch(() => null);
    if (info && info.mtimeMs > since) touched.push(name);
  }
  if (touched.length === 0) return undefined;
  return `assay: ${touched.slice(0, 5).join(", ")} changed after the last passing gate run. Rerun assay, then commit.`;
}

/** Staged, modified and untracked files. A commit can carry all three. */
async function changedSources(pi: ExtensionAPI, cwd: string): Promise<string[] | null> {
  const staged = await pi.exec("git", ["-C", cwd, "diff", "--cached", "--name-only", "-z"], { cwd });
  if (staged.code !== 0) return null;
  const worktree = await pi.exec("git", ["-C", cwd, "ls-files", "-m", "-o", "--exclude-standard", "-z"], { cwd });
  if (worktree.code !== 0) return null;
  const names = `${staged.stdout ?? ""}\0${worktree.stdout ?? ""}`.split("\0").filter(Boolean);
  return [...new Set(names)];
}