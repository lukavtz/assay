import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { assayTool } from "../lib/tool.ts";

const DUPLICATED = `def invoice_total(order, rate):
    subtotal = sum(item.price * item.qty for item in order.items)
    discount = subtotal * order.discount if order.discount else 0
    taxed = (subtotal - discount) * (1 + rate)
    rounded = round(taxed, 2)
    return {"subtotal": subtotal, "discount": discount, "total": rounded}


def receipt_total(cart, rate):
    base = sum(line.price * line.qty for line in cart.lines)
    cut = base * cart.cut if cart.cut else 0
    gross = (base - cut) * (1 + rate)
    final = round(gross, 2)
    return {"subtotal": base, "discount": cut, "total": final}
`;

const SINGLE = `def invoice_total(order, rate):
    subtotal = sum(item.price * item.qty for item in order.items)
    discount = subtotal * order.discount if order.discount else 0
    taxed = (subtotal - discount) * (1 + rate)
    return {"subtotal": subtotal, "discount": discount, "total": round(taxed, 2)}
`;

const host = {
  zod: z,
  exec: async (command: string, args: string[], options: { cwd?: string }) => {
    const proc = Bun.spawn([command, ...args], { cwd: options.cwd, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
      proc.exited,
    ]);
    return { code, stdout, stderr };
  },
};

const projects: string[] = [];

async function projectWith(source: string) {
  const root = await mkdtemp(join(tmpdir(), "assay-it-"));
  projects.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "calc.py"), source, "utf8");
  return root;
}

afterAll(async () => {
  await Promise.all(projects.map(root => rm(root, { recursive: true, force: true })));
});

describe("assay tool", () => {
  test(
    "fails on structural duplication and names the fix",
    async () => {
      const cwd = await projectWith(DUPLICATED);
      const tool = assayTool(host as never);
      const result = await tool.execute(
        "call-1",
        { paths: "src", threshold: 10, coverage: "skip", duplication: true, mutation: "off" },
        undefined,
        undefined as never,
        { cwd } as never,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("duplication");
      expect(result.details.ok).toBe(false);
    },
    180_000,
  );

  test(
    "passes once the duplicate is gone and writes the record",
    async () => {
      const cwd = await projectWith(SINGLE);
      const tool = assayTool(host as never);
      const result = await tool.execute(
        "call-2",
        { paths: "src", threshold: 10, coverage: "skip", duplication: true, mutation: "off" },
        undefined,
        undefined as never,
        { cwd } as never,
      );
      expect(result.isError).toBe(false);
      expect(await Bun.file(join(cwd, ".metrics", "assay.json")).exists()).toBe(true);
    },
    180_000,
  );

  test("refuses an option-shaped target before running anything", async () => {
    const cwd = await projectWith(SINGLE);
    const tool = assayTool(host as never);
    expect(
      tool.execute(
        "call-3",
        { paths: "--coverage-command,curl evil", threshold: 10, coverage: "skip", duplication: false, mutation: "off" },
        undefined,
        undefined as never,
        { cwd } as never,
      ),
    ).rejects.toThrow(/options/);
  });
});
