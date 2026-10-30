# assay

An omp plugin marketplace: deterministic quality gates for agent-written code.

```sh
omp plugin marketplace add lukavtz/assay
omp plugin install omp-assay@assay
```

Or install the plugin directly, without the catalog:

```sh
omp plugin install github:lukavtz/assay#v0.1.0
```

## Catalog

| Plugin | What it adds |
|---|---|
| [`omp-assay`](plugins/assay/README.md) | `assay` tool, assay skill, commit guard. CRAP < 10, structural duplication review, mutation testing |

## Why

A skill alone is advice. A model that is told to keep functions simple agrees and moves on. The plugin ships measurements: cyclomatic complexity and coverage per function, structural similarity between functions, and mutation survival. The tool returns pass/fail, and a hook stops `git commit` while the result is missing, failed, or stale.

## Layout

```text
.omp-plugin/marketplace.json   catalog read by `omp plugin marketplace add`
plugins/assay/               the installable plugin
  skills/assay/SKILL.md      the method
  tools/assay/index.ts          assay: runs the checks, writes .metrics/assay.json
  hooks/pre/commit-gate.ts     blocks a commit on a missing or failing gate
  vendor/                      crapper, dryer, mutator (0BSD) at pinned commits
```

## Docs

- [Specification](docs/SPEC.md) — surfaces, contracts, acceptance criteria
- [ADR 0001](docs/adr/0001-vendor-the-tools.md) — why the tools are vendored
- [ADR 0002](docs/adr/0002-pass-fail-is-a-record.md) — why pass/fail is a persisted record

## Development

```sh
omp plugin link plugins/assay
omp plugin doctor
omp plugin list
```

A linked plugin tracks source edits. Tools, hooks and extension modules need a new session, not `/reload-plugins`.

Test the gate on a project whose functions are known-bad:

```sh
cd some/project
omp -p 'Call assay with paths ["src"] and report the result.'
```

## Publish

```sh
git tag v0.1.0
git push origin main --tags
```

Consumers refresh with `omp plugin marketplace update assay` and `omp plugin upgrade omp-assay@assay`.

## License

Plugin code MIT. Vendored tools 0BSD; see `plugins/assay/vendor/UPSTREAM.md` for upstream commits and the two Windows patches applied locally.
