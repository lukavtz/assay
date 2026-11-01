# ADR 0003 — Own engine, tree-sitter assets, no Python

Status: accepted (2026-11-01). Supersedes [0001](0001-vendor-the-tools.md).

## Context

0.1.0 vendored three Python tools. It worked, but the cost was structural:

- a virtualenv, `pip`, and interpreter discovery (the source of two Windows bugs);
- three CLIs with three exit-code philosophies, all of which had to be normalised anyway;
- ~500 KB of source we did not write, with patches that must be re-applied on every refresh;
- a hard dependency on Python 3.11+ on the user's machine.

The gate only needs three things: an AST, a coverage report, and a way to run tests.

## Decision

Implement the engine in TypeScript inside the plugin, and parse with tree-sitter compiled to WebAssembly. Runtime and grammars are vendored in `assets/` (≈5 MB, MIT) so the plugin has no install step and no interpreter requirement.

| Concern | Our implementation |
|---|---|
| Complexity | Cyclomatic decision points per language profile, counted per function |
| CRAP | `CC² × (1 − coverage)³ + CC`, coverage joined from LCOV or `go test -coverprofile` |
| Duplication | Jaccard similarity over k-gram hashes of a structural fingerprint (names and literals normalised away) |
| Mutation | Operator replacement inside recognised functions, sequential, original text restored in `finally` |

## Consequences

- One runtime (Bun), one language, no subprocess for analysis. The whole suite runs in under a second.
- Repository grows by ~5 MB of wasm. Acceptable for a self-contained tool; recorded in `assets/README.md` with versions and licenses.
- We own the semantics now. Divergence from the upstream tools is possible and must be documented rather than accidental: language profiles are data in `lib/engine/profiles.ts`, so a reviewer can read exactly which nodes count as a decision.
- Unsupported languages are dropped rather than degraded: no Clojure profile yet, because the shipped grammar set has none.
- Mutation runs sequentially in place. ponytail: parallel workers would need copy-on-write overlays; add when a real repository makes the run painful.