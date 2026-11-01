import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

type Language = {
  version: number;
};

type ParserInstance = {
  setLanguage(language: Language): void;
  parse(source: string): unknown;
};

type ParserConstructor = {
  init(options: { locateFile: (name: string) => string }): Promise<void>;
  Language: { load(path: string): Promise<Language> };
  new (): ParserInstance;
};

const ASSETS = new URL("../../assets/", import.meta.url);
const languages = new Map<string, Language>();
let runtime: ParserConstructor | undefined;
let initialised: Promise<void> | undefined;

/**
 * The vendored runtime is CommonJS. omp loads extensions as ESM and rejects a
 * module without a default export, so it is required lazily, after load.
 */
function parserRuntime(): ParserConstructor {
  runtime ??= createRequire(import.meta.url)("../../assets/tree-sitter.js") as ParserConstructor;
  return runtime;
}

function locate(name: string): string {
  return fileURLToPath(new URL(name, ASSETS));
}

/** One wasm runtime for the whole run; grammars load lazily and stay cached. */
export async function parserFor(grammar: string): Promise<ParserInstance> {
  const parser = parserRuntime();
  initialised ??= parser.init({ locateFile: locate });
  await initialised;
  let language = languages.get(grammar);
  if (!language) {
    language = await parser.Language.load(locate(grammar));
    languages.set(grammar, language);
  }
  const instance = new parser();
  instance.setLanguage(language);
  return instance;
}