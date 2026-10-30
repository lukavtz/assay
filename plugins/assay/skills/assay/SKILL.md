---
description: Use when writing or changing code and quality matters: make it work, then make it right (CRAP < 10, no structural duplicates, no surviving mutants), then commit. Run the assay tool before every commit.
---

# assay

Every change follows three phases in order. Do not skip ahead.

## 1. First make it work

- **Laziness protocol.** One decision in one place. Ship the smallest edit that solves the problem.
- **Foundational thinking.** Get the data shape right before the logic. If a concurrent writer would matter, do not share state.
- **TDD.** Write the failing test first. See it fail for the expected reason. Make the smallest change that passes. If an honest test is impractical, do not write a bad one.
- **Redesign from first principles.** Do not bolt new requirements onto an old design. Ask what you would have built if the requirement had existed from day one, then deliver it in pieces.
- **Attack the premise.** When two fixes sharing one premise fail the same gate, write that premise in one sentence and remove it. Do not start a third fix.
- **Subtract before you add.** Take complexity out first.
- **Outcome-oriented execution.** Aim at an end state you can check. A planned, undoable break in the middle is allowed.
- **Build the lever.** Do one unit by hand, then make the tool match it.

### Architecture

- Model the domain so illegal states cannot be represented. Keep a glossary of domain terms.
- Validate at the boundary, trust inside, keep business logic pure.
- Parse outside data once, where it enters.
- Make operations idempotent: running twice, or after a crash halfway, ends in the same state.
- If two things do not need the same mutable state, give each its own; if they do, allow one writer and enforce it in the structure.

## 2. Then make it right

- **Fix root causes.** Reproduce, fix the cause. A guard that hides a crash is not a fix.
- **Sequence into verifiable units.** Finish one small unit, check it, start the next.
- **Test behavior, not implementation.** The test calls the code the way its user does. If the test would pass with every function returning nothing, delete it.

### The gate

Use the `assay` tool, not raw shell. It runs three checks and writes `.metrics/assay.json`:

| Check | Tool | Rule |
|---|---|---|
| CRAP per function | `crapper` | score < 10 |
| Structural duplication | `dryer` | no candidate at score ≥ 0.82 |
| Mutation coverage | `mutator` | no surviving mutant |

Start narrow, widen before commit:

```
assay(paths: "src/foo.py")
assay()                       # changed files, tests run
assay(mutation: "scan")       # list mutation sites, cheap
assay(mutation: "run")        # execute mutants, slow
```

Fix findings in this order:

1. **Uncovered code.** Add the behavior test. Coverage is what makes CRAP meaningful.
2. **CRAP ≥ 10.** Split the function or test it, or both. Consider whether a long case statement is worth reducing.
3. **Duplication ≥ 0.82.** Extract the shared shape, or prove the two forms differ in behavior and say why.
4. **Surviving mutants.** Kill them with a test that observes the mutated behavior, or delete dead code.

A failing gate is a finding, not an obstacle. Never lower a threshold, add a suppression, or skip checks to pass. If a threshold must change, state the reason and get agreement first.

## 3. Practice

- **Keep a log.** Every action and why. Report it when the work is done.
- **Guard the context window.** Keep the main thread small; send bulk work elsewhere and keep the summary.
- **Worktree cleanup.** Find what is safe to remove, confirm nothing in use needs it, then reclaim the disk. Uncommitted work waits for a decision.
- **Commit and push.** Small ordered commits. Each says why, what changed, and how you proved it. The commit guard blocks `git commit` while the gate result is missing, failed, or older than a staged source file.

## Version discipline

No `_v2`, `_final_final`, or copied files. Edit the file in place. Git holds history, the version lives in one place.
