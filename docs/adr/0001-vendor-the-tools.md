# ADR 0001 — Vendor the measurement tools

Status: accepted (2026-10-30)

## Context

crapper, dryer and mutator are separate GitHub repositories, published by their author without PyPI releases. The plugin needs all three at run time, on Windows and POSIX, offline after install.

## Options

1. `pip install git+https://...` on first use. Needs network, and a Git or pip failure at gate time is an outage.
2. Depend on a published distribution. None exists.
3. Vendor the source in the plugin and install it into a private virtualenv on first run.

## Decision

Option 3. The three trees live in `plugins/assay/vendor/` at pinned commits; the first tool call creates `plugins/assay/.venv` and `pip install -e`s them.

## Consequences

- The gate works offline and against a known revision.
- Plugin tarball grows by ~500 KB.
- Upstream fixes must be pulled deliberately; `vendor/UPSTREAM.md` records the commits and the two local Windows patches.
- The virtualenv lives inside the plugin directory, which is writable in both linked and market-installed layouts. It is ignored by git and by the published file list.
