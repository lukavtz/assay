# ADR 0002 — Pass/fail is a record, not a stream

Status: accepted (2026-10-30)

## Context

The three tools disagree about exit codes. crapper exits `2` only when `--threshold` is passed. dryer always exits `0` on a report. mutator uses `0`, `2` (red baseline) and `3` (survivors). A gate cannot forward one exit code and call it truth.

## Options

1. Parse stdout on every call. Brittle: table widths and wording change upstream.
2. Forward the exit code of the first failing tool. Loses which check failed and why.
3. Normalize each tool into a `Check` and persist the whole result.

## Decision

Option 3. The tool builds `checks{crap,duplication,mutation}` with `{ok, exit, note}`, writes `<cwd>/.metrics/assay.json`, and returns `isError` when any check fails. dryer is gated on the candidate count parsed from `.metrics/dry.edn`, not on its exit code.

The commit guard reads that record. Staleness is mtime-based: a staged source file newer than the record's `stamp` invalidates it.

## Consequences

- One file answers "did the gate pass, on what, and when" for the hook, the user and any later CI step.
- `.metrics/` stays a build artifact and is gitignored.
- mtime is a heuristic. A checkout can make a file newer than the record and force a rerun; that errs toward re-measuring, never toward a stale pass.
- A malformed or missing record fails closed.
- The record is not signed. Anything with write access to the project can forge it, so the guard is a speed bump against an agent that skips the gate, not a defence against a hostile one. A real boundary needs a `pre-commit` hook installed by the user plus a signed record; that is out of scope for a plugin that cannot sandbox its own host.
- The guard keys on `bash` tool calls whose text mentions `git` and `commit`. A commit made through another tool, a script, or `git merge` is not intercepted. DOCUMENTED LIMIT: the record plus the habit is the enforcement; the hook is the reminder.
