export type Profile = {
  language: string;
  extensions: string[];
  grammar: string;
  functions: string[];
  decisions: string[];
  operators: string[];
  testPatterns: RegExp[];
  testCommand?: string[];
};

const TS_FUNCTIONS = ["function_declaration", "method_definition", "arrow_function", "function_expression"];

export const PROFILES: Profile[] = [
  {
    language: "python",
    extensions: [".py", ".pyi"],
    grammar: "tree-sitter-python.wasm",
    functions: ["function_definition"],
    decisions: ["if_statement", "elif_clause", "for_statement", "while_statement", "except_clause", "conditional_expression", "case_clause", "if_clause"],
    operators: ["and", "or"],
    testPatterns: [/^test_.*\.py$/, /.*_test\.py$/, /^conftest\.py$/],
    testCommand: ["python", "-m", "pytest", "-q"],
  },
  {
    language: "typescript",
    extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
    grammar: "tree-sitter-tsx.wasm",
    functions: TS_FUNCTIONS,
    decisions: [
      "if_statement",
      "for_statement",
      "for_in_statement",
      "while_statement",
      "do_statement",
      "switch_case",
      "catch_clause",
      "ternary_expression",
    ],
    operators: ["&&", "||", "??"],
    testPatterns: [/.*\.(test|spec)\.(ts|tsx|js|jsx|mts|cts)$/],
    testCommand: ["npm", "test", "--silent"],
  },
  {
    language: "go",
    extensions: [".go"],
    grammar: "tree-sitter-go.wasm",
    functions: ["function_declaration", "method_declaration"],
    decisions: ["if_statement", "for_statement", "expression_case", "type_case", "communication_case"],
    operators: ["&&", "||"],
    testPatterns: [/.*_test\.go$/],
    testCommand: ["go", "test", "./..."],
  },
  {
    language: "rust",
    extensions: [".rs"],
    grammar: "tree-sitter-rust.wasm",
    functions: ["function_item"],
    decisions: ["if_expression", "match_arm", "for_expression", "while_expression", "loop_expression", "try_expression"],
    operators: ["&&", "||"],
    testPatterns: [],
    testCommand: ["cargo", "test", "--quiet"],
  },
  {
    language: "java",
    extensions: [".java"],
    grammar: "tree-sitter-java.wasm",
    functions: ["method_declaration", "constructor_declaration"],
    decisions: [
      "if_statement",
      "for_statement",
      "enhanced_for_statement",
      "while_statement",
      "do_statement",
      "catch_clause",
      "switch_block_statement_group",
      "ternary_expression",
      "switch_label",
    ],
    operators: ["&&", "||"],
    testPatterns: [/.*(Test|Tests|IT)\.java$/],
    testCommand: ["mvn", "-q", "test"],
  },
];

const BY_EXTENSION = new Map<string, Profile>();
for (const profile of PROFILES) {
  for (const extension of profile.extensions) BY_EXTENSION.set(extension, profile);
}

export function profileFor(path: string): Profile | undefined {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? undefined : BY_EXTENSION.get(path.slice(dot).toLowerCase());
}

export function isTestPath(profile: Profile, path: string): boolean {
  const name = path.split(/[\\/]/).pop() ?? "";
  return profile.testPatterns.some(pattern => pattern.test(name));
}

/** Directories that never hold first-party source. */
export const SKIP_DIRS: Record<string, true> = {
  ".git": true,
  ".hg": true,
  ".svn": true,
  node_modules: true,
  vendor: true,
  target: true,
  dist: true,
  build: true,
  out: true,
  ".venv": true,
  venv: true,
  __pycache__: true,
  ".metrics": true,
  ".pytest_cache": true,
  ".mypy_cache": true,
};