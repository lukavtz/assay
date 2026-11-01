import type { Unit } from "./analyze.ts";

export type Duplicate = {
  score: number;
  language: string;
  left: { file: string; name: string; startLine: number; endLine: number; nodes: number };
  right: { file: string; name: string; startLine: number; endLine: number; nodes: number };
};

/**
 * Jaccard similarity over structural fingerprints. ponytail: pairwise comparison,
 * no index; revisit if a repository exceeds a few thousand functions.
 */
export function findDuplicates(
  units: Unit[],
  { threshold = 0.82, minLines = 4, minNodes = 20 } = {},
): Duplicate[] {
  const candidates = units.filter(unit => unit.endLine - unit.startLine + 1 >= minLines && unit.fingerprint.size >= minNodes);
  const found: Duplicate[] = [];
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const a = candidates[left];
      const b = candidates[right];
      if (a.language !== b.language) continue;
      const shared = intersect(a.fingerprint, b.fingerprint);
      if (shared === 0) continue;
      const score = shared / (a.fingerprint.size + b.fingerprint.size - shared);
      if (score < threshold) continue;
      found.push({
        score: Math.round(score * 100) / 100,
        language: a.language,
        left: describe(a),
        right: describe(b),
      });
    }
  }
  return found.sort((a, b) => b.score - a.score);
}

function describe(unit: Unit) {
  return {
    file: unit.file,
    name: unit.name,
    startLine: unit.startLine,
    endLine: unit.endLine,
    nodes: unit.fingerprint.size,
  };
}

function intersect(a: Set<number>, b: Set<number>): number {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}