import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Load application modules in Node, with explicit dependencies replaced by test doubles. */
export function createModuleLoader(mocks = {}) {
  const cache = new Map();
  const mockKey = `__labTestModules_${crypto.randomUUID()}`;
  globalThis[mockKey] = mocks;

  function resolve(specifier, parent = path.join(root, 'package.json')) {
    let file = specifier.startsWith('@/')
      ? path.join(root, 'src', specifier.slice(2))
      : path.resolve(path.dirname(parent), specifier);
    if (!path.extname(file)) file += '.ts';
    return file;
  }

  function moduleURL(file) {
    if (cache.has(file)) return cache.get(file);
    let code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      fileName: file,
    }).outputText;
    // Next enforces this marker in production. Node's test runner has no RSC loader.
    code = code.replace(/import\s*['"]server-only['"];?/g, '');
    code = code.replace(/from\s*['"]([^'"]+)['"]/g, (_, specifier) => {
      let target;
      if (Object.hasOwn(mocks, specifier)) {
        const source = Object.keys(mocks[specifier])
          .map(
            (name) =>
              `const ${name} = globalThis[${JSON.stringify(mockKey)}][${JSON.stringify(specifier)}][${JSON.stringify(name)}]; export { ${name} };`,
          )
          .join('\n');
        target = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
      } else if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        target = moduleURL(resolve(specifier, file));
      } else {
        target = specifier.startsWith('node:') ? specifier : import.meta.resolve(specifier);
      }
      return 'from ' + JSON.stringify(target);
    });
    const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
    cache.set(file, url);
    return url;
  }

  return (specifier) => import(moduleURL(resolve(specifier)));
}
