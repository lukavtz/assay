export type LineHits = Map<number, number>;

const SF = /^SF:(.+)$/;
const DA = /^DA:(\d+),(\d+)/;

/** LCOV: coverage.py --lcov, c8/vitest, cargo llvm-cov, tarpaulin all emit it. */
export function parseLcov(text: string): Map<string, LineHits> {
  const files = new Map<string, LineHits>();
  let current: LineHits | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const file = SF.exec(raw);
    if (file) {
      current = files.get(file[1]) ?? new Map();
      files.set(file[1], current);
      continue;
    }
    const line = DA.exec(raw);
    if (line && current) {
      const number = Number(line[1]);
      current.set(number, Math.max(current.get(number) ?? 0, Number(line[2])));
    }
  }
  return files;
}

/** `go test -coverprofile`: `file:startLine.startCol,endLine.endCol numStmt count`. */
export function parseGoCover(text: string): Map<string, LineHits> {
  const files = new Map<string, LineHits>();
  for (const raw of text.split(/\r?\n/)) {
    if (raw.length === 0 || raw.startsWith("mode:")) continue;
    const colon = raw.indexOf(":");
    const space = raw.indexOf(" ");
    if (colon === -1 || space === -1) continue;
    const path = raw.slice(0, colon);
    const range = raw.slice(colon + 1, space).split(",")[0];
    const start = Number(range.split(".")[0]);
    const count = Number(raw.slice(space + 1).trim().split(" ").pop());
    if (!Number.isFinite(start) || !Number.isFinite(count)) continue;
    const hits = files.get(path) ?? new Map();
    hits.set(start, Math.max(hits.get(start) ?? 0, count));
    files.set(path, hits);
  }
  return files;
}

/**
 * Lookup tolerates the three shapes reports use: absolute paths, project-relative
 * paths and bare module paths.
 */
export function hitsFor(report: Map<string, LineHits>, relativePath: string): LineHits | undefined {
  if (report.size === 0) return undefined;
  const normalised = relativePath.split("\\").join("/");
  for (const [key, hits] of report) {
    const candidate = key.split("\\").join("/");
    if (candidate === normalised || candidate.endsWith(`/${normalised}`)) return hits;
  }
  return undefined;
}