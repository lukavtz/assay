export type RunResult = { code: number; stdout: string; stderr: string };
export type Check = { ok: boolean; exit: number; note: string };

/** Header plus the ten worst rows, or the first twelve lines when there is no table. */
export function worstRows(stdout: string): string {
  const lines = stdout
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0 && !/^[-=\s]+$/.test(line));
  const header = lines.findIndex(line => line.startsWith("Function"));
  return lines.slice(header === -1 ? 0 : header, header === -1 ? 12 : header + 11).join("\n");
}

export function duplicateLines(stdout: string): string {
  return stdout
    .split(/\r?\n/)
    .filter(line => /DUPLICATE|\.(py|ts|tsx|js|jsx|go|rs|java|clj|cljc|cljs):/.test(line))
    .slice(0, 12)
    .join("\n");
}

export function coverageGap(stderr: string): string {
  const line = stderr
    .split(/\r?\n/)
    .find(text => /coverage is missing|will score 0%|No coverage/i.test(text));
  return line ? line.trim().slice(0, 160) : "";
}

export function mutationOutcome(mode: "scan" | "run", result: RunResult): Check {
  if (mode === "scan") {
    const sites = (result.stdout.match(/^\s+\S+:\d+/gm) ?? []).length;
    return { ok: result.code === 0, exit: result.code, note: `${sites} site(s)` };
  }
  if (result.code === 0) return { ok: true, exit: 0, note: "all mutants killed" };
  if (result.code === 2) return { ok: false, exit: 2, note: "baseline tests failed" };
  if (result.code === 3) return { ok: false, exit: 3, note: "surviving mutants" };
  return { ok: false, exit: result.code, note: "mutator error" };
}

export function remediation(checks: Record<string, Check>, coverage: string): string {
  const hints: string[] = [];
  if (!checks.crap.ok) {
    hints.push(
      coverage === "run"
        ? "CRAP: cover the function with a behavior test first, then split it if the score stays high."
        : "CRAP: split the function, or rerun with coverage so the score reflects the tests.",
    );
  }
  if (!checks.duplication.ok) {
    hints.push("Duplication: extract the shared shape, or state why the two forms must differ.");
  }
  if (!checks.mutation.ok) {
    hints.push(
      checks.mutation.exit === 2
        ? "Mutator: the test suite is red; fix it before measuring mutants."
        : "Mutator: add a test that observes the mutated behavior, or delete the dead branch.",
    );
  }
  return `Fix: ${hints.join(" ")}`;
}

export function tail(text: string, lines: number): string {
  return text.trimEnd().split(/\r?\n/).slice(-lines).join("\n").trim();
}
