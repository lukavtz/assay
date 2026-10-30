import { afterAll, describe, expect, mock, test } from "bun:test";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("@oh-my-pi/pi-coding-agent", () => ({
  isToolCallEventType: (name: string, event: { toolName?: string }) => event.toolName === name,
}));

// Dynamic on purpose: mock.module must register before the hook imports the host package.
const { default: commitGate } = await import("../hooks/pre/commit-gate.ts");

type Handler = (event: unknown, ctx: unknown) => Promise<{ block?: boolean; reason?: string } | undefined>;

const projects: string[] = [];

async function wiring(root: string, record?: Record<string, unknown>, staged: string[] = []) {
  const handlers: Handler[] = [];
  const pi = {
    on: (_name: string, handler: Handler) => handlers.push(handler),
    exec: async () => ({ code: 0, stdout: staged.join("\0") + "\0", stderr: "" }),
  };
  commitGate(pi as never);
  await mkdir(join(root, ".metrics"), { recursive: true });
  if (record) {
    await writeFile(join(root, ".metrics", "assay.json"), JSON.stringify(record), "utf8");
  }
  return { handler: handlers[0], ctx: { cwd: root } };
}

async function tempProject() {
  const root = await mkdtemp(join(tmpdir(), "assay-hook-"));
  projects.push(root);
  return root;
}

const commit = { toolName: "bash", input: { command: "git commit -m x" } };
const pass = (cwd: string, stamp: string) => ({ ok: true, cwd, stamp, reason: "" });

afterAll(async () => {
  await Promise.all(projects.map(root => rm(root, { recursive: true, force: true })));
});

describe("commit guard", () => {
  test("blocks a commit when no gate record exists", async () => {
    const root = await tempProject();
    const { handler, ctx } = await wiring(root);
    const result = await handler(commit, ctx);
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("Run the assay tool first");
  });

  test("blocks when the record belongs to another project", async () => {
    const { handler, ctx } = await wiring(await tempProject(), pass("/somewhere/else", new Date().toISOString()));
    expect((await handler(commit, ctx))?.block).toBe(true);
  });

  test("blocks a record that failed", async () => {
    const root = await tempProject();
    const { handler, ctx } = await wiring(root, { ok: false, cwd: root, reason: "crap: CRAP above 10" });
    const result = await handler(commit, ctx);
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("CRAP above 10");
  });

  test("blocks an implausible timestamp instead of trusting it", async () => {
    const root = await tempProject();
    const { handler, ctx } = await wiring(root, pass(root, "not-a-date"));
    expect((await handler(commit, ctx))?.block).toBe(true);
  });

  test("blocks when a staged source file is newer than the record", async () => {
    const root = await tempProject();
    const { handler, ctx } = await wiring(root, pass(root, new Date(Date.now() - 60_000).toISOString()), ["src/a.py"]);
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "a.py"), "x = 1\n", "utf8");
    const future = new Date(Date.now() - 1_000);
    await utimes(join(root, "src", "a.py"), future, future);
    expect((await handler(commit, ctx))?.block).toBe(true);
  });

  test("allows a commit after a fresh passing record", async () => {
    const root = await tempProject();
    const { handler, ctx } = await wiring(root, pass(root, new Date().toISOString()), ["src/a.py"]);
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "a.py"), "x = 1\n", "utf8");
    const past = new Date(Date.now() - 5_000);
    await utimes(join(root, "src", "a.py"), past, past);
    expect(await handler(commit, ctx)).toBeUndefined();
  });

  test("ignores commands that are not commits", async () => {
    const { handler, ctx } = await wiring(await tempProject());
    expect(await handler({ toolName: "bash", input: { command: "git status" } }, ctx)).toBeUndefined();
  });

  test("ASSAY_SKIP bypasses the guard for one command", async () => {
    const { handler, ctx } = await wiring(await tempProject());
    process.env.ASSAY_SKIP = "1";
    expect(await handler(commit, ctx)).toBeUndefined();
    delete process.env.ASSAY_SKIP;
  });
});
