# omp-assay

Quality gate for [omp](https://omp.sh): the assay method as a skill, backed by deterministic checks instead of good intentions.

A model that is told to keep functions simple agrees and moves on. This plugin gives it a tool that returns measurements and fails a commit when the numbers are bad.

## What ships

| Surface | Path | Purpose |
|---|---|---|
| Skill | `skills/assay/SKILL.md` | The three phases: make it work, make it right, practice |
| Tool | `tools/assay/index.ts` | `assay` — runs crapper, dryer and mutator, writes `.metrics/assay.json` |
| Hook | `hooks/pre/commit-gate.ts` | Blocks `git commit` when the gate result is missing, failed, or older than a staged source file |
| Vendored tools | `vendor/` | crapper, dryer, mutator, and the upstream assay skill |

## Checks

| Check | Tool | Fails when |
|---|---|---|
| CRAP per function | [crapper](https://github.com/unclebob/crapper) | any score ≥ threshold (default 10) |
| Structural duplication | [dryer](https://github.com/unclebob/dryer) | any candidate at score ≥ 0.82 |
| Mutation coverage | [unclebob/mutator](https://github.com/unclebob/mutator) | a mutant survives |

CRAP is `CC² × (1 − coverage)³ + CC`. A function with high coverage but CRAP ≥ 10 is simply too complex; a function with low coverage scores badly even when it is simple.

## Use

The skill loads on its own when a task matches. Call the tool directly when you want numbers:

```
assay()
assay(paths: "src", threshold: 10)
assay(paths: "src, tests", coverage: "existing")
assay(mutation: "scan")
```

First run creates `plugins/assay/.venv` and installs the vendored packages. Set `ASSAY_PYTHON` to an interpreter path if no Python 3.11+ is reachable as `py -3`, `python` or `python3`.

Skip the commit guard for one command with `ASSAY_SKIP=1`. That flag exists for a broken gate, not a failing one.

## Support

Clojure, Java, Go, TypeScript/JavaScript, Rust, Python. A missing language toolchain scores that language at 0% coverage, which fails the gate — install the toolchain or pass `coverage: "skip"` while bootstrapping.

## Licenses

Plugin code: MIT. Vendored tools: 0BSD, see `vendor/*/LICENSE`. Upstream commits and local patches: `vendor/UPSTREAM.md`.
