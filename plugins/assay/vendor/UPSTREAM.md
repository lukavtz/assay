# Vendored upstream

Copied from the repositories below at the pinned commits. `assay` supplies the method; the three Python tools supply the measurements.

| Directory | Source | Commit |
|---|---|---|
| `assay/` | https://github.com/unclebob/assay | `57a8bdd28e45ed41900ace0bafa2ff76dd9ed70f` |
| `crapper/` | https://github.com/unclebob/crapper | `6fd92c4c9bcc56efb64a2f8743d5a2993bcfd42d` |
| `dryer/` | https://github.com/unclebob/dryer | `66ff6d21a42c04afcad89c78a80066176d1294b0` |
| `mutator/` | https://github.com/unclebob/mutator | `a5a0cb803b66e0cdb8bf471b3b08af701d424a41` |

All three tools are 0BSD; their `LICENSE` files are kept beside the source.

## Local patches

Two Windows defects blocked the gate. Both are minimal and upstream-shaped.

1. `crapper/src/crapper/runners.py` — `_python_executable` looked only for `.venv/bin/python`, which does not exist on Windows. It fell back to `python3` from `PATH`, so coverage was never found and every function scored 0%. Now it also checks `.venv/Scripts/python.exe` and falls back to `sys.executable`.
2. `mutator/src/mutator/workers.py` — the worker overlay used symlinks, which fail without Developer Mode (`WinError 1314`). Directory links now fall back to `mklink /J` junctions; files are copied. `delete_tree` removes junctions instead of walking into them.

Re-apply these when refreshing a vendored tool.
