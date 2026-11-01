import { describe, expect, test } from "bun:test";
import { unitsIn } from "../lib/engine/analyze.ts";
import { parseGoCover, parseLcov, hitsFor } from "../lib/engine/coverage.ts";
import { findDuplicates } from "../lib/engine/duplicates.ts";

const python = `def grade(score):
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    return "F"
`;

const typescript = `export function f(a: number, b: number) {
  if (a && b) { return a ? 1 : 2; }
  return a ?? b;
}
`;

const go = `package p

func f(a int) int {
	if a > 0 && a < 10 {
		return a
	}
	return 0
}
`;

const rust = `fn f(a: i32) -> i32 {
    if a > 0 && a < 10 { return a; }
    match a { 1 => 1, _ => 2 }
}
`;

const java = `class C {
  int f(int a) {
    if (a > 0 && a < 2) { return a; }
    return a > 0 ? 1 : 2;
  }
}
`;

describe("complexity", () => {
  test("python: if and elif are one path each", async () => {
    const [unit] = await unitsIn("a.py", python);
    expect(unit.complexity).toBe(3);
    expect(unit.name).toBe("grade");
  });

  test("typescript: if, &&, ternary and ??", async () => {
    const [unit] = await unitsIn("a.ts", typescript);
    expect(unit.complexity).toBe(5);
  });

  test("go: if and && ", async () => {
    const [unit] = await unitsIn("a.go", go);
    expect(unit.complexity).toBe(3);
  });

  test("rust: if, && and each match arm", async () => {
    const [unit] = await unitsIn("a.rs", rust);
    expect(unit.complexity).toBe(5);
  });

  test("java: if, && and ternary", async () => {
    const [unit] = await unitsIn("C.java", java);
    expect(unit.complexity).toBe(4);
  });

  test("an unknown extension yields no units", async () => {
    expect(await unitsIn("a.xyz", python)).toEqual([]);
  });
});

describe("duplicates", () => {
  const pair = `def alpha(xs):
    ys = [x for x in xs if x > 0]
    zs = [y + 1 for y in ys]
    return zs


def beta(items):
    kept = [i for i in items if i > 0]
    bumped = [k + 1 for k in kept]
    return bumped
`;

  test("two shapes that differ only in names collide", async () => {
    const units = await unitsIn("a.py", pair);
    const found = findDuplicates(units, { minLines: 3, minNodes: 10 });
    expect(found).toHaveLength(1);
    expect(found[0].score).toBeGreaterThanOrEqual(0.9);
  });

  test("a different shape does not collide", async () => {
    const units = await unitsIn("a.py", `${pair}\n\ndef gamma(n):\n    while n > 0:\n        n -= 1\n    return n\n`);
    const found = findDuplicates(units, { minLines: 3, minNodes: 10 });
    expect(found.every(duplicate => duplicate.left.name !== "gamma" && duplicate.right.name !== "gamma")).toBe(true);
  });
});

describe("coverage parsing", () => {
  test("lcov joins per line hits", () => {
    const report = parseLcov("SF:src/a.py\nDA:1,1\nDA:2,0\nend_of_record\n");
    expect(hitsFor(report, "src/a.py")?.get(1)).toBe(1);
    expect(hitsFor(report, "src/a.py")?.get(2)).toBe(0);
  });

  test("lcov matches a nested path suffix", () => {
    const report = parseLcov("SF:/abs/repo/src/a.py\nDA:3,2\nend_of_record\n");
    expect(hitsFor(report, "src/a.py")?.get(3)).toBe(2);
  });

  test("go coverprofile parses the statement count", () => {
    const report = parseGoCover("mode: set\npkg/a.go:3.10,5.2 1 3\npkg/a.go:7.1,8.2 1 0\n");
    expect(hitsFor(report, "pkg/a.go")?.get(3)).toBe(3);
    expect(hitsFor(report, "pkg/a.go")?.get(7)).toBe(0);
  });
});