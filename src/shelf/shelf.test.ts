import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The shelf holds finished modules that nothing on the page imports, so that
 * the difference between what ships and what is merely green is visible from
 * the file tree. See `README.md` beside this file.
 *
 * A directory only says that for as long as it stays true, which is what these
 * three tests are for: the first fails if shipping code reaches in here, the
 * second fails if a module arrives without the README admitting it, and the
 * third fails if the README's table has gone stale about how big one is.
 * Bringing a module back means moving the file to `src/utils/` in the same
 * commit as the section that renders it — reversing the move is the only way
 * to reverse the decision.
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
    // the bring-one-back list names every one of them — so a looser match
    // would read that list as the inventory.
    const documented = [...readme.matchAll(/^\| `([^`]+)` \|/gm)].map((row) => row[1]).sort();

    expect(shelfModules).not.toEqual([]);
    expect(documented).toEqual(shelfModules);
  });

  it('has a README whose line counts are the files\' own', () => {
    const readme = readFileSync(join(SHELF_DIR, 'README.md'), 'utf8');
    // The same rows, read for their second column. The counts drifted by
    // hundreds of lines before anything checked them — three of the four
    // original rows were stale by the time two more arrived — and a table
    // that is wrong about size reads as a table nobody maintains.
    const documented = [...readme.matchAll(/^\| `([^`]+)` \| (\d+) \|/gm)].map((row) => [
      row[1],
      Number(row[2]),
    ]);
    const actual = documented.map(([name]) => [
      name,
      readFileSync(join(SHELF_DIR, String(name)), 'utf8').split('\n').length - 1,
    ]);

    expect(documented).toEqual(actual);
  });
});
