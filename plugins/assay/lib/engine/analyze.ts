import { parserFor } from "./parse.ts";
import { profileFor } from "./profiles.ts";

export type Node = {
  type: string;
  text: string;
  childCount: number;
  children: Node[];
  parent: Node | null;
  startPosition: { row: number };
  endPosition: { row: number };
  childForFieldName(name: string): Node | null;
};

export type Unit = {
  name: string;
  file: string;
  language: string;
  namespace: string;
  startLine: number;
  endLine: number;
  complexity: number;
  fingerprint: Set<number>;
};

/** CRAP = CC² × (1 − coverage)³ + CC, the Fitzpatrick formula. */
export function crapScore(complexity: number, coverage: number): number {
  const gap = 1 - Math.min(Math.max(coverage, 0), 1);
  return complexity ** 2 * gap ** 3 + complexity;
}

export async function unitsIn(file: string, source: string): Promise<Unit[]> {
  const profile = profileFor(file);
  if (!profile) return [];
  const parser = await parserFor(profile.grammar);
  const tree = parser.parse(source) as unknown as { rootNode: Node };
  if (!tree) return [];

  const units: Unit[] = [];
  const visit = (node: Node, namespace: string): void => {
    if (profile.functions.includes(node.type)) {
      const name = nameOf(node);
      if (name) {
        units.push({
          name,
          file,
          language: profile.language,
          namespace: namespace || "(top level)",
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          complexity: 1 + decisionPoints(node, profile),
          fingerprint: fingerprintOf(node),
        });
      }
      return;
    }
    const inner = className(node) ?? namespace;
    for (const child of node.children) visit(child, inner);
  };
  visit(tree.rootNode, "");
  return units;
}

function nameOf(node: Node): string | undefined {
  const named = node.childForFieldName("name");
  if (named) return named.text;
  const parent = node.parent;
  if (parent?.type === "variable_declarator") {
    return parent.childForFieldName("name")?.text ?? undefined;
  }
  return undefined;
}

function className(node: Node): string | undefined {
  if (!/class|impl|struct|interface|object|trait|enum/.test(node.type)) return undefined;
  return node.childForFieldName("name")?.text ?? undefined;
}

function decisionPoints(unit: Node, profile: { decisions: string[]; operators: string[] }): number {
  let count = 0;
  const walk = (node: Node): void => {
    if (profile.decisions.includes(node.type)) count += 1;
    if (node.type === "binary_expression" || node.type === "boolean_operator") {
      if (node.children.some(child => child.childCount === 0 && profile.operators.includes(child.text))) count += 1;
    }
    for (const child of node.children) walk(child);
  };
  for (const child of unit.children) walk(child);
  return count;
}

/**
 * A fingerprint ignores names, literals and comments: it records the shape of
 * the tree, so two functions that differ only in identifiers collide.
 */
function fingerprintOf(node: Node): Set<number> {
  const tokens: string[] = [];
  const walk = (current: Node): void => {
    if (current.type === "comment") return;
    tokens.push(current.childCount === 0 ? leafToken(current) : current.type);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return grams(tokens);
}

function leafToken(node: Node): string {
  if (/identifier|name$|_name|type_identifier|field_identifier|property_identifier/.test(node.type)) return "id";
  if (/string|number|integer|float|char|rune|boolean|true|false|nil|null/.test(node.type)) return "lit";
  return node.text;
}

/** Overlapping k-grams keep local order without comparing whole trees. */
function grams(tokens: string[], size = 3): Set<number> {
  const set = new Set<number>();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    set.add(hash(tokens.slice(index, index + size).join(" ")));
  }
  return set;
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}