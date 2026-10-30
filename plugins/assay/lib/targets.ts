import { relative, resolve, sep } from "node:path";

/**
 * Model-supplied targets become argv for the vendored tools, so a token must
 * never look like an option and must never leave the project.
 */
export function confinedTargets(project: string, selected: string[]): string[] {
  return selected.map(token => {
    if (token.startsWith("-")) {
      throw new Error(`assay: refusing "${token}" as a path; pass files or directories, not options.`);
    }
    const absolute = resolve(project, token);
    const inside = relative(project, absolute);
    if (inside.startsWith("..") || inside === "" && absolute !== project) {
      throw new Error(`assay: "${token}" is outside the project.`);
    }
    return inside ? inside.split(sep).join("/") : ".";
  });
}
