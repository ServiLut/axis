import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Server action contract tests: all external dependencies must be explicitly mocked.
// No database driver, auth provider or network module can be loaded by this harness.
export function loadServerModule<T>(filename: string, mocks: Record<string, unknown>, env: Record<string, string> = {}): T {
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const load = (file: string): Record<string, unknown> => {
    const absolute = resolve(file);
    const cached = cache.get(absolute);
    if (cached) return cached.exports;
    const loadedModule = { exports: {} as Record<string, unknown> };
    cache.set(absolute, loadedModule);
    const code = ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    runInNewContext(code, {
      module: loadedModule, exports: loadedModule.exports, Date, Intl, URL, FormData, console: { error() {}, warn() {} }, process: { env },
      require: (id: string) => {
        if (id in mocks) return mocks[id];
        if (id === "@/lib/bogota-date" || id === "@/lib/client-phone" || id === "@/lib/caja" || id === "@/lib/constants/tenants") {
          return load(resolve(id.replace("@/", "") + ".ts"));
        }
        if (id === "./bogota-date") return load(resolve(dirname(absolute), "bogota-date.ts"));
        throw new Error(`Unmocked dependency: ${id}`);
      },
    }, { filename: absolute });
    return loadedModule.exports;
  };
  return load(filename) as T;
}
