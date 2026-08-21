// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import config, { manualChunks } from '../vite.config';

/**
 * How the app is cut into files, and the assumption that cut is made under.
 *
 * `manualChunks` splits one 576 kB bundle into app, React and chart library so
 * that a deploy that changes only app code invalidates only app code. Nothing
 * about that is visible on the page, so nothing on the page can fail when it
 * breaks: drop the rule and every build goes back to one chunk and one chunk
 * warning, and the only symptom is a returning reader silently re-fetching
 * half a megabyte they already had.
 *
 * The rule itself is one line of regex, and it is written against an invariant
 * rather than a survey — "everything in node_modules that is not React is the
 * chart library" is only true while recharts is the sole other runtime
 * dependency. That is the assertion worth having here. A future dependency
 * would land in a chunk called `charts` without being a chart, and the name
 * would quietly stop describing the file.
 */
const root = (path: string) => resolve(process.cwd(), path);
const pkg = JSON.parse(readFileSync(root('package.json'), 'utf8'));

/** A module id shaped the way rollup hands them to `manualChunks`. */
const inNodeModules = (specifier: string) =>
  `${root('node_modules')}/${specifier}/dist/index.js`;

describe('the build\'s chunking', () => {
  it('sends the chart library and everything under it to one chunk', () => {
    for (const dep of [
      'recharts',
      'victory-vendor',
      'd3-scale',
      'd3-shape',
      'd3-time-format',
      '@reduxjs/toolkit',
      'react-redux',
      'immer',
      'es-toolkit',
      'decimal.js-light',
    ]) {
      expect(manualChunks(inNodeModules(dep))).toBe('charts');
    }
  });

  it('keeps React out of it, so a recharts bump does not move React', () => {
    for (const dep of ['react', 'react-dom', 'react-is', 'scheduler']) {
      expect(manualChunks(inNodeModules(dep))).toBe('react');
    }
  });

  it('leaves app source in the entry chunk', () => {
    for (const source of ['src/App.tsx', 'src/utils/tax.ts', 'src/main.tsx']) {
      expect(manualChunks(root(source))).toBeUndefined();
    }
  });

  it('is the rule the build actually runs', () => {
    const output = config.build?.rollupOptions?.output;
    expect(Array.isArray(output)).toBe(false);
    expect((output as { manualChunks?: unknown })?.manualChunks).toBe(
      manualChunks,
    );
  });

  it('still has only recharts to call a chart library', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      'react',
      'react-dom',
      'recharts',
    ]);
  });
});
