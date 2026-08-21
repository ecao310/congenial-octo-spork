import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The shelf holds finished modules that nothing on the page imports, so that
 * the difference between what ships and what is merely green is visible from
 * the file tree. See `README.md` beside this file.
 *
 * A directory only says that for as long as it stays true, which is what these
 * two tests are for: the first fails if shipping code reaches in here, the
 * second fails if a module arrives without the README admitting it. Bringing a
 * module back means moving the file to `src/utils/` in the same commit as the
 * section that renders it — reversing the move is the only way to reverse the
 * decision.
 */

// Resolved from the working directory rather than from `import.meta.url`,
// which vitest rewrites to a non-`file:` URL that `fileURLToPath` refuses.
const SRC_DIR = join(process.cwd(), 'src', '/');
const SHELF_DIR = join(SRC_DIR, 'shelf', '/');

/** Every `.ts`/`.tsx` file under `dir`, recursively, as absolute paths. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The specifier of every `import`/`export ... from` in a file. */
function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/\bfrom\s+'([^']+)'/g)].map((match) => match[1]);
}

const shelfModules = sourceFiles(SHELF_DIR)
  .map((path) => path.slice(SHELF_DIR.length))
  .filter((name) => !name.endsWith('.test.ts'))
  .sort();

describe('the shelf', () => {
  it('is imported by nothing outside itself', () => {
    const offenders = sourceFiles(SRC_DIR)
      .filter((path) => !path.startsWith(SHELF_DIR))
      .flatMap((path) =>
        importSpecifiers(readFileSync(path, 'utf8'))
          .filter((specifier) => /(^|\/)shelf\//.test(specifier))
          .map((specifier) => `${path.slice(SRC_DIR.length)} imports ${specifier}`),
      );

    // Rendering one of these means moving its file out of `src/shelf/`, not
    // importing across the line — the move is what records the decision.
    expect(offenders).toEqual([]);
  });

  it('has a README whose table is exactly what is on it', () => {
    const readme = readFileSync(join(SHELF_DIR, 'README.md'), 'utf8');
    // The rows of the "What is on it" table, which is the only place in the
    // README a module name starts a line. Prose elsewhere names modules too —
    // the bring-one-back list names all four — so a looser match would read
    // that list as the inventory.
    const documented = [...readme.matchAll(/^\| `([^`]+)` \|/gm)].map((row) => row[1]).sort();

    expect(shelfModules).not.toEqual([]);
    expect(documented).toEqual(shelfModules);
  });
});
