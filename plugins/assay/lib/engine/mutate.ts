import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { profileFor, type Profile } from "./profiles.ts";
import { parserFor } from "./parse.ts";
import type { Node } from "./analyze.ts";

export type Site = { line: number; from: string; to: string };

export type MutationResult = {
  sites: number;
  killed: number;
  survived: Site[];
  errored: number;
  command: string;
};

const OPERATORS: Record<string, string> = {
  "+": "-",
  "-": "+",
  "*": "/",
  "/": "*",
  "%": "*",
  "==": "!=",
  "!=": "==",
  "===": "!==",
  "!==": "===",
  "<": "<=",
  "<=": "<",
  ">": ">=",
  ">=": ">",
  "&&": "||",
  "||": "&&",
  "??": "||",
  and: "or",
  or: "and",
  not: "",
  True: "False",
  False: "True",
  true: "false",
  false: "true",
};

const SKIP_TYPES = /string|comment|char|template|regex/;

export async function sitesIn(file: string, source: string): Promise<Site[]> {
  const profile = profileFor(file);
  if (!profile) return [];
  const parser = await parserFor(profile.grammar);
  const tree = parser.parse(source) as unknown as { rootNode: Node };
  if (!tree) return [];
  const sites: Site[] = [];
  const walk = (node: Node): void => {
    if (profile.functions.includes(node.type)) {
      collect(node, profile, sites);
      return;
    }
    for (const child of node.children) walk(child);
  };
  walk(tree.rootNode);
  return sites;
}

function collect(unit: Node, profile: Profile, into: Site[]): void {
  const walk = (node: Node): void => {
    if (node.childCount === 0 && !SKIP_TYPES.test(node.type)) {
      const replacement = OPERATORS[node.text];
      if (replacement !== undefined && replacement !== node.text) {
        into.push({ line: node.startPosition.row + 1, from: node.text, to: replacement });
      }
    }
    for (const child of node.children) walk(child);
  };
  for (const child of unit.children) walk(child);
}

/** Applies one site to one line; the caller restores the original text afterwards. */
export function applySite(lines: string[], site: Site): boolean {
  const index = site.line - 1;
  if (index < 0 || index >= lines.length) return false;
  const pattern = new RegExp(`(^|[^\\w$])(${escape(site.from)})(?=$|[^\\w$])`);
  if (!pattern.test(lines[index])) return false;
  lines[index] = lines[index].replace(pattern, (_match, prefix: string) => `${prefix}${site.to}`);
  return true;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function runMutations(
  root: string,
  files: string[],
  command: string[],
  { maxSites = 25, timeoutMs = 120_000, maxSurvivors = 10 } = {},
): Promise<MutationResult> {
  const total: MutationResult = { sites: 0, killed: 0, survived: [], errored: 0, command: command.join(" ") };
  for (const file of files) {
    if (total.sites >= maxSites || total.survived.length >= maxSurvivors) break;
    const source = await readFile(file, "utf8").catch(() => "");
    if (!source) continue;
    const candidates = (await sitesIn(file, source)).slice(0, maxSites - total.sites);
    if (candidates.length === 0) continue;
    const outcome = await mutateFile(file, source, candidates, command, root, timeoutMs, maxSurvivors - total.survived.length);
    total.sites += outcome.sites;
    total.killed += outcome.killed;
    total.errored += outcome.errored;
    total.survived.push(...outcome.survived);
  }
  return total;
}

type FileOutcome = Omit<MutationResult, "command">;

async function mutateFile(
  file: string,
  source: string,
  candidates: Site[],
  command: string[],
  root: string,
  timeoutMs: number,
  survivorBudget: number,
): Promise<FileOutcome> {
  const original = source.split("\n");
  const outcome: FileOutcome = { sites: 0, killed: 0, survived: [], errored: 0 };
  for (const site of candidates) {
    if (outcome.survived.length >= survivorBudget) break;
    const lines = [...original];
    if (!applySite(lines, site)) continue;
    outcome.sites += 1;
    const verdict = await oneSite(file, lines.join("\n"), original.join("\n"), site, command, root, timeoutMs);
    if (verdict === "killed") outcome.killed += 1;
    else if (verdict === "survived") outcome.survived.push(site);
    else outcome.errored += 1;
  }
  return outcome;
}

async function oneSite(
  file: string,
  mutated: string,
  original: string,
  site: Site,
  command: string[],
  root: string,
  timeoutMs: number,
): Promise<"killed" | "survived" | "error"> {
  await writeFile(file, mutated, "utf8");
  try {
    return (await runWithTimeout(command, root, timeoutMs)) === 0 ? "survived" : "killed";
  } catch {
    return "error";
  } finally {
    await writeFile(file, original, "utf8");
  }
}

async function runWithTimeout(command: string[], cwd: string, timeoutMs: number): Promise<number> {
  const { promise, resolve } = Promise.withResolvers<number>();
  const child = spawn(command[0], command.slice(1), { cwd, shell: false, stdio: "ignore" });
  const timer = setTimeout(() => {
    child.kill();
    resolve(124);
  }, timeoutMs);
  child.on("close", code => {
    clearTimeout(timer);
    resolve(code ?? 1);
  });
  child.on("error", () => {
    clearTimeout(timer);
    resolve(127);
  });
  return await promise;
}
