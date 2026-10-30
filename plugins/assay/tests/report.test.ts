import { describe, expect, test } from "bun:test";
import { coverageGap, duplicateLines, mutationOutcome, remediation, tail, worstRows } from "../lib/report.ts";

const CRAP_STDOUT = ["CRAP Report", "===========", "Languages: python", "", "Function   Namespace   CC   Cov%   CRAP", "--------------------------------------------------"]
  .concat(Array.from({ length: 14 }, (_, i) => `f${i}   calc   ${i}   10.0%   ${i}.0`))
  .join("\n");

describe("worstRows", () => {
  test("keeps the header and the ten worst rows", () => {
    const rows = worstRows(CRAP_STDOUT).split("\n");
    expect(rows[0].startsWith("Function")).toBe(true);
    expect(rows).toHaveLength(11);
    expect(rows.at(-1)).toContain("f9");
  });

  test("falls back to the first twelve lines when there is no table", () => {
    const rows = worstRows(Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n")).split("\n");
    expect(rows).toHaveLength(12);
    expect(rows[0]).toBe("line 0");
  });
});

describe("coverageGap", () => {
  test("returns the line that explains a missing coverage tool", () => {
    const stderr = "noise\ncoverage is missing in C:/repo. Python coverage will score 0%.\nmore";
    expect(coverageGap(stderr)).toBe("coverage is missing in C:/repo. Python coverage will score 0%.");
  });

  test("returns an empty string when coverage ran", () => {
    expect(coverageGap("+ pytest -q\n3 passed")).toBe("");
  });
});

describe("mutationOutcome", () => {
  test("scan counts listed sites instead of trusting the exit code", () => {
    const stdout = "Scan: 3 mutation sites in src/a.py\n  src/a.py:2 >= -> >  [defn/grade]\n  src/a.py:9 + -> -  [defn/add]";
    const check = mutationOutcome("scan", { code: 0, stdout, stderr: "" });
    expect(check.ok).toBe(true);
    expect(check.note).toBe("2 site(s)");
  });

  test("a clean run kills every mutant", () => {
    expect(mutationOutcome("run", { code: 0, stdout: "", stderr: "" }).ok).toBe(true);
  });

  test("exit 2 is a red baseline, not a surviving mutant", () => {
    const check = mutationOutcome("run", { code: 2, stdout: "", stderr: "" });
    expect(check.ok).toBe(false);
    expect(check.note).toBe("baseline tests failed");
  });

  test("exit 3 reports survivors", () => {
    const check = mutationOutcome("run", { code: 3, stdout: "", stderr: "" });
    expect(check.note).toBe("surviving mutants");
  });

  test("any other exit is a tool error", () => {
    expect(mutationOutcome("run", { code: 1, stdout: "", stderr: "boom" }).note).toBe("mutator error");
  });
});

describe("remediation", () => {
  test("names the first move for a failing CRAP check under coverage", () => {
    const text = remediation(
      {
        crap: { ok: false, exit: 2, note: "CRAP above 10" },
        duplication: { ok: true, exit: 0, note: "" },
        mutation: { ok: true, exit: 0, note: "" },
      },
      "run",
    );
    expect(text).toContain("behavior test");
  });

  test("stays quiet when every check passes", () => {
    const pass = { ok: true, exit: 0, note: "" };
    expect(remediation({ crap: pass, duplication: pass, mutation: pass }, "skip")).toBe("Fix: ");
  });
});

describe("duplicateLines", () => {
  test("keeps duplicate headers and locations only", () => {
    const stdout = "DUPLICATE score=1.00\n  src/a.py:1-3\n  src/a.py:6-8\nWrote .metrics/dry.edn";
    expect(duplicateLines(stdout).split("\n")).toEqual(["DUPLICATE score=1.00", "  src/a.py:1-3", "  src/a.py:6-8"]);
  });

  test("caps a long report", () => {
    const stdout = Array.from({ length: 30 }, () => "  a.py:1-3").join("\n");
    expect(duplicateLines(stdout).split("\n")).toHaveLength(12);
  });
});

describe("tail", () => {
  test("keeps the last lines and trims trailing whitespace", () => {
    expect(tail("a\nb\nc\n\n", 2)).toBe("b\nc");
  });
});
