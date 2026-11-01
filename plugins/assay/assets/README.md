# Vendored runtime assets

The gate parses source with [tree-sitter](https://tree-sitter.github.io) compiled to WebAssembly. Shipping the runtime and the grammars inside the plugin keeps the tool self-contained: no npm install, no Python, no network at run time.

| File | Source | Version | License |
|---|---|---|---|
| `tree-sitter.js`, `tree-sitter.wasm` | `web-tree-sitter` | 0.22.6 | MIT |
| `tree-sitter-python.wasm` | `tree-sitter-wasms` | 0.1.13 | MIT |
| `tree-sitter-tsx.wasm` | `tree-sitter-wasms` | 0.1.13 | MIT |
| `tree-sitter-javascript.wasm` | `tree-sitter-wasms` | 0.1.13 | MIT |
| `tree-sitter-go.wasm` | `tree-sitter-wasms` | 0.1.13 | MIT |
| `tree-sitter-rust.wasm` | `tree-sitter-wasms` | 0.1.13 | MIT |
| `tree-sitter-java.wasm` | `tree-sitter-wasms` | 0.1.13 | MIT |

`web-tree-sitter` and `tree-sitter-wasms` stay in `devDependencies` so the assets can be refreshed:

```sh
bun install
cp node_modules/web-tree-sitter/tree-sitter.js node_modules/web-tree-sitter/tree-sitter.wasm assets/
for g in python tsx javascript go rust java; do cp "node_modules/tree-sitter-wasms/out/tree-sitter-$g.wasm" assets/; done
```

Bump the versions in the table when you do. `tsx` also parses plain TypeScript, so the separate `typescript` grammar is not shipped.