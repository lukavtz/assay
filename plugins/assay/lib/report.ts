import type { ScoredUnit } from "./engine/project.ts";
import type { Duplicate } from "./engine/duplicates.ts";

export type Check = { ok: boolean; exit: number; note: string };

const HEADER = "Function                       Namespace                  CC    Cov%     CRAP";

/** Worst first; functions without coverage data sort last. */
export function renderTable(units: ScoredUnit[], limit = 10): string {
  const rows = [...units]
    .sort((a, b) => (b.crap ?? -1) - (a.crap ?? -1) || b.complexity - a.complexity)
    .slice(0, limit)
    .map(unit => {
      const coverage = unit.coverage === null ? "N/A" : `${(unit.coverage * 100).toFixed(0)}%`;
      const crap = unit.crap === null ? "N/A" : unit.crap.toFixed(1);
      return `${pad(unit.name, 30)} ${pad(unit.namespace, 25)} ${pad(String(unit.complexity), 4)}  ${pad(coverage, 6)} ${pad(crap, 8)}`;
    });
  return [HEADER, ...rows].join("\n");
}

export function duplicateLines(duplicates: Duplicate[], limit = 10): string {
  return duplicates
    .slice(0, limit)
    .map(
      duplicate =>
        `DUPLICATE ${duplicate.score.toFixed(2)} ${duplicate.language}\n` +
        `  ${duplicate.left.file}:${duplicate.left.startLine}-${duplicate.left.endLine} (${duplicate.left.name})\n` +
        `  ${duplicate.right.file}:${duplicate.right.startLine}-${duplicate.right.endLine} (${duplicate.right.name})`,
    )
    .join("\n");
}

export function remediation(checks: Record<string, Check>, coverage: string, unitCount: number): string {
  const hints: string[] = [];
  if (!checks.crap.ok) {
    hints.push(
      coverage === "skip"
        ? "CRAP: split the function, or measure coverage so the score reflects the tests."
        : "CRAP: cover the function with a behavior test first, then split it if the score stays high.",
    );
  }
  if (!checks.duplication.ok) {
    hints.push("Duplication: extract the shared shape, or state why the two forms must differ.");
  }
  if (!checks.mutation.ok) {
    hints.push("Mutator: add a test that observes the mutated behavior, or delete the dead branch.");
  }
  if (unitCount === 0) hints.push("No function was recognised; check the language profile and the target paths.");
  return `Fix: ${hints.join(" ")}`;
}

export function tail(text: string, lines: number): string {
  return text.trimEnd().split(/\r?\n/).slice(-lines).join("\n").trim();
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text.padEnd(width);
}