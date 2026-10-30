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
| Duplication | no structural candidate at Jaccard ≥ 0.82 with `--min-lines 3` | Two forms share a shape and should share code |
| Mutation | no surviving mutant | A test asserts the result but not the behavior |

Exit codes from the vendored tools are mapped, not passed through blindly: mutator `2` means a red baseline (tests broken), `3` means survivors.

## Acceptance

1. `bun test` passes.
2. First `assay` call on a clean machine creates `.venv` and installs the vendored packages, with no manual step.
3. A repo with a CRAP ≥ 10 function fails; adding behavior tests or splitting it passes.
4. `git commit` in a repo without a passing record is blocked with an actionable reason.
5. `git commit` after a passing record, with no source edits since, is allowed.
6. Windows without Developer Mode works (junction fallback in mutator, `Scripts\python.exe` detection in crapper).
7. A target that starts with `-`, or resolves outside the project, is refused before any subprocess runs.
8. `.metrics` or the record file being a symlink refuses the write; `.metrics/dry.edn` being a symlink is ignored.
9. Every subprocess is bounded (15 minute timeout, 200 KB captured).

## Non-goals

- Sandboxing. The plugin runs with the user's permissions, as omp documents for all plugins.
- Autofixing findings. The agent fixes; assay measures.
- Replacing CI. The same commands can run there, but the plugin targets the edit loop.
- Vendored-tool authorship. Upstream source is pinned and patched minimally; see `vendor/UPSTREAM.md`.
