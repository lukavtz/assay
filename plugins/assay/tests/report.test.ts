import { describe, expect, test } from "bun:test";
import type { ScoredUnit } from "../lib/engine/project.ts";
import { duplicateLines, renderTable, remediation, tail, type Check } from "../lib/report.ts";

const unit = (name: string, complexity: number, coverage: number | null): ScoredUnit => ({
  name,
  file: "src/a.py",
  language: "python",
  namespace: "(top level)",
  startLine: 1,
  endLine: 5,
  complexity,
  fingerprint: new Set([1, 2]),
  coverage,
  crap: coverage === null ? null : complexity ** 2 * (1 - coverage) ** 3 + complexity,
});

describe("renderTable", () => {
  test("sorts the worst score first and keeps the header", () => {
    const rows = renderTable([unit("easy", 1, 1), unit("bad", 5, 0), unit("unknown", 2, null)]).split("\n");
    expect(rows[0].startsWith("Function")).toBe(true);
    expect(rows[1]).toContain("bad");
    expect(rows.at(-1)).toContain("unknown");
  });

  test("prints N/A when coverage is absent", () => {
    expect(renderTable([unit("unknown", 2, null)])).toContain("N/A");
  });

  test("caps the number of rows", () => {
    const many = Array.from({ length: 30 }, (_, index) => unit(`f${index}`, index + 1, 0.5));
    expect(renderTable(many).split("\n")).toHaveLength(11);
  });
});

describe("duplicateLines", () => {
  test("names both sides with location and score", () => {
    const text = duplicateLines([
      {
        score: 1,
        language: "python",
        left: { file: "a.py", name: "alpha", startLine: 1, endLine: 4, nodes: 12 },
        right: { file: "a.py", name: "beta", startLine: 7, endLine: 10, nodes: 12 },
      },
    ]);
    expect(text).toContain("DUPLICATE 1.00 python");
    expect(text).toContain("a.py:1-4 (alpha)");
    expect(text).toContain("a.py:7-10 (beta)");
  });
});

describe("remediation", () => {
  const pass: Check = { ok: true, exit: 0, note: "" };

  test("points at coverage first when the gate ran with it", () => {
    const text = remediation({ crap: { ok: false, exit: 1, note: "" }, duplication: pass, mutation: pass }, "existing", 3);
    expect(text).toContain("behavior test");
  });

  test("asks for splitting when coverage was skipped", () => {
    const text = remediation({ crap: { ok: false, exit: 1, note: "" }, duplication: pass, mutation: pass }, "skip", 3);
    expect(text).toContain("split the function");
  });

  test("explains an empty parse", () => {
    expect(remediation({ crap: pass, duplication: pass, mutation: pass }, "skip", 0)).toContain("No function was recognised");
  });
});

describe("tail", () => {
  test("keeps the last lines and trims trailing whitespace", () => {
    expect(tail("a\nb\nc\n\n", 2)).toBe("b\nc");
  });
});
