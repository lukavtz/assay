# omp-assay

Quality gate for [omp](https://omp.sh): the assay method as a skill, backed by measurements instead of good intentions.

A model told to keep functions simple agrees and moves on. This plugin gives it numbers and stops a commit while they are bad.

## What ships

| Surface | Path | Purpose |
|---|---|---|
| Skill | `skills/assay/SKILL.md` | Three phases: make it work, make it right, practice |
| Tool | `extensions/assay.ts` → `lib/tool.ts` | `assay` — measures, writes `.metrics/assay.json` |
| Engine | `lib/engine/` | Parsing, complexity, coverage join, duplication, mutation |
| Hook | `hooks/pre/commit-gate.ts` | Blocks `git commit` on a missing, failed or stale result |
| Assets | `assets/` | tree-sitter runtime and six grammars, vendored |

No Python. No virtualenv. No install step.

## Checks

| Check | Rule |
|---|---|
| CRAP per function | `CC² × (1 − coverage)³ + CC < threshold` (default 10) |
| Structural duplication | No pair at Jaccard ≥ 0.82 |
| Mutation | No surviving mutant |

Coverage is read from `coverage/lcov.info` (coverage.py, c8, vitest, cargo llvm-cov, tarpaulin) or `coverage.out` (Go). `coverage: "run"` executes your command first; `"skip"` measures complexity only.

## Languages

Python, TypeScript/TSX/JavaScript, Go, Rust, Java. Profiles live in `lib/engine/profiles.ts`: each one lists the node types that count as a function and as a decision, so the rule is readable, not folklore.

## Use

```
assay(paths: "src", threshold: 10, coverage: "existing", duplication: true, mutation: "off")
assay(mutation: "scan")                       # list mutation sites, cheap
assay(mutation: "run", testCommand: "pytest -q")
assay(coverage: "run", coverageCommand: "pytest --cov --cov-report=lcov")
```

Skip the commit guard for one command with `ASSAY_SKIP=1`. That flag exists for a broken gate, not a failing one.

## Honest limits

- The commit guard keys on `bash` calls that mention `git ... commit`. `git merge` and scripts pass. It is a speed bump, not a sandbox.
- The record is not signed; anything that can write the project can forge it.
- Mutation runs sequentially and in place, with the original text restored in `finally`. Default cap: 25 sites.
- No Clojure profile: the shipped grammar set has no Clojure grammar.

## Licenses

Plugin code MIT. Vendored parser assets: see `assets/README.md`.