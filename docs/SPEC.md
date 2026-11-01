# Assay — specification

## Problem

An agent writes code faster than a reviewer reads it. Rules alone do not hold: a model told to keep functions simple agrees, then ships a 60-line branch ladder.

Assay turns the ub-mode method into measurements the agent cannot talk its way past.

## Users

1. **Agent.** Calls the `assay` tool after a change, reads the failures, fixes them.
2. **Developer.** Reads `.metrics/assay.json`, or trusts the commit guard.
3. **Plugin author.** Copies the layout for another gate.

## Surfaces

| Surface | Contract |
|---|---|
| Tool `assay` (extension `extensions/assay.ts`) | Input: optional `paths` (comma-separated), `threshold` (default 10), `coverage` (`run`/`existing`/`skip`), `duplication` (bool), `mutation` (`off`/`scan`/`run`). Output: pass/fail per check plus remediation; `isError` when the gate fails. Side effect: writes `<cwd>/.metrics/assay.json`. |
| Skill `assay` | Loads on matching tasks. States the three phases, the thresholds, and the fix order. |
| Hook `hooks/pre/commit-gate.ts` | Blocks a `bash` call that runs `git commit` when `.metrics/assay.json` is missing, red, or older than a staged source file. `ASSAY_SKIP=1` bypasses it for one command. |
| Record `.metrics/assay.json` | `{ ok, stamp, cwd, threshold, coverage, reason, checks{crap,duplication,mutation}, worst }`. Stable field names; consumed by the hook. |

## Checks

| Check | Rule | Failure meaning |
|---|---|---|
| CRAP | `CC² × (1 − coverage)³ + CC < threshold` per function | Either the function is too complex or the tests do not reach it |
| Duplication | no structural candidate at Jaccard ≥ 0.82, minimum 4 lines and 20 fingerprint nodes | Two forms share a shape and should share code |
| Mutation | no surviving mutant | A test asserts the result but not the behavior |

All three run in-process on a vendored tree-sitter WebAssembly build. Coverage joins from LCOV or a Go coverprofile; a file absent from the report scores 0%.

## Acceptance

1. `bun test` passes.
2. A fresh clone measures a project with no install step: the tree-sitter runtime and grammars ship in `assets/`.
3. A repo with a CRAP ≥ 10 function fails; adding behavior tests or splitting it passes.
4. `git commit` in a repo without a passing record is blocked with an actionable reason.
5. `git commit` after a passing record, with no source edits since, is allowed.
6. Windows without Developer Mode works: no symlinks, no Python, no virtualenv.
7. A target that starts with `-`, or resolves outside the project, is refused before any subprocess runs.
8. `.metrics` or the record file being a symlink refuses the write.
9. Test and coverage subprocesses are bounded by timeout; analysis itself spawns nothing.

## Languages

Python, TypeScript/TSX/JavaScript, Go, Rust, Java. A profile is data: function node types, decision node types, branch operators, test-file patterns, default test command. Adding a language is a profile entry plus a `.wasm` asset.

## Non-goals

- Sandboxing. The plugin runs with the user's permissions, as omp documents for all plugins.
- Autofixing findings. The agent fixes; assay measures.
- Replacing CI. The same commands can run there, but the plugin targets the edit loop.
- Parser authorship. tree-sitter and the grammars are vendored as assets, not reimplemented; see `assets/README.md`.
