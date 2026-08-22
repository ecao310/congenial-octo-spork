// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, createLogger, resolveConfig, type Rolldown } from 'vite';
import config from '../vite.config';

/**
 * How the app is cut into files, that the cut is made under a still-true
 * assumption, and that the pipeline doing the cutting is configured once.
 *
 * `codeSplitting` splits one ~565 kB bundle into app, React and chart library
 * so that a deploy that changes only app code invalidates only app code.
 * Nothing about that is visible on the page, so nothing on the page can fail
 * when it breaks: drop the rule and every build goes back to one chunk and one
 * chunk warning, and the only symptom is a returning reader silently
 * re-fetching half a megabyte they already had.
 *
 * The earlier version of this file asserted the *rule* — that a classifier
 * function sent react-dom to `'react'`. Vite 8 is why it now asserts the
 * *output* as well. Rolldown accepted that rule, reported no warning, and
 * emitted a `react` chunk holding 0.8 kB of ESM wrapper with react-dom itself
 * left in `charts`; every assertion about the classifier passed while the
 * split it existed to make was gone. A rule is only worth what the build does
 * with it, so `the build it emits` below runs a real production build in
 * memory and reads the module list off each chunk.
 */
const root = (path: string) => resolve(process.cwd(), path);
const pkg = JSON.parse(readFileSync(root('package.json'), 'utf8'));

/** A module id shaped the way rolldown hands them to a group's `test`. */
const inNodeModules = (specifier: string) =>
  `${root('node_modules')}/${specifier}/dist/index.js`;

/**
 * Where the *config* sends a module, read back out of the object the build is
 * handed. Going through `config.build.rollupOptions` rather than importing the
 * classifier directly is what makes each case below a claim about the build
 * instead of a claim about a function that may or may not be wired to one.
 */
const chunkOf = (id: string): string | undefined => {
  const output = config.build?.rollupOptions?.output;
  if (Array.isArray(output)) throw new Error('expected one output, not many');
  const splitting = output?.codeSplitting;
  if (typeof splitting !== 'object' || !splitting.groups?.length) {
    throw new Error('the config declares no code-splitting groups');
  }
  for (const { name, test } of splitting.groups) {
    if (typeof name !== 'string') throw new Error('group names are strings here');
    if (typeof test !== 'function') throw new Error('group tests are predicates here');
    if (test(id)) return name;
  }
  return undefined;
};

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
      expect(chunkOf(inNodeModules(dep))).toBe('charts');
    }
  });

  it('keeps React out of it, so a recharts bump does not move React', () => {
    for (const dep of ['react', 'react-dom', 'react-is', 'scheduler']) {
      expect(chunkOf(inNodeModules(dep))).toBe('react');
    }
  });

  it('leaves app source in the entry chunk', () => {
    for (const source of ['src/App.tsx', 'src/utils/tax.ts', 'src/main.tsx']) {
      expect(chunkOf(root(source))).toBeUndefined();
    }
  });

  it('still has only recharts to call a chart library', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      'react',
      'react-dom',
      'recharts',
    ]);
  });
});

describe('the build it emits', () => {
  /** The real production build, in memory — no `dist/` is written or read. */
  const chunks = new Map<string, Rolldown.OutputChunk>();

  beforeAll(async () => {
    /*
     * Vitest sets NODE_ENV=test, and Vite reads it over `mode` when it decides
     * what `process.env.NODE_ENV` compiles to and whether it is building for
     * production. Left alone, this builds React's *development* copy behind the
     * dev JSX transform — 318 kB of react chunk and 87 kB of app against the
     * 140 and 67 that deploy — so every size below would be measuring a bundle
     * no reader ever downloads. Forced, the four chunks come out byte-identical
     * to `npx vite build`.
     */
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = await build({
        configFile: root('vite.config.ts'),
        logLevel: 'silent',
        build: { write: false },
      });
      const bundle = Array.isArray(result) ? result[0] : result;
      if (!('output' in bundle)) throw new Error('expected a one-shot build');
      for (const item of bundle.output) {
        if (item.type === 'chunk') chunks.set(item.name, item);
      }
    } finally {
      process.env.NODE_ENV = was;
    }
  }, 60_000);

  /** Which chunk a package's own files were bundled into, if any. */
  const homeOf = (specifier: string) => {
    const inside = new RegExp(`node_modules[/\\\\]${specifier}[/\\\\]`);
    return [...chunks]
      .filter(([, chunk]) => Object.keys(chunk.modules).some((m) => inside.test(m)))
      .map(([name]) => name)
      .sort();
  };

  it('bundles React itself into the react chunk, not just its wrapper', () => {
    expect(homeOf('react-dom')).toEqual(['react']);
    expect(homeOf('scheduler')).toEqual(['react']);
  });

  it('bundles the chart library into the charts chunk', () => {
    expect(homeOf('recharts')).toEqual(['charts']);
    expect(homeOf('d3-scale')).toEqual(['charts']);
  });

  it('keeps every chunk under the 500 kB Vite warns at', () => {
    const oversized = [...chunks]
      .filter(([, chunk]) => chunk.code.length / 1000 > 500)
      .map(([name, chunk]) => `${name}: ${Math.round(chunk.code.length / 1000)} kB`);
    expect(oversized).toEqual([]);
  });
});

describe('the transform pipeline', () => {
  /**
   * Every `vitest run` and every CI test step used to open with "Both esbuild
   * and oxc options were set… `{ jsx: 'automatic', jsxImportSource: undefined
   * }`", because @vitejs/plugin-react 4 configured esbuild's JSX while the
   * Vite under it had moved to oxc. Harmless, and indistinguishable in a
   * failed CI log from a real misconfiguration.
   *
   * Vite reports that through its logger, so a logger that records instead of
   * printing is the whole test. It catches the family, not one message: any
   * plugin or option that speaks to the retired half of the pipeline warns
   * here, and any future one will too.
   */
  for (const command of ['build', 'serve'] as const) {
    it(`resolves for \`${command}\` without a deprecation warning`, async () => {
      const said: string[] = [];
      const logger = createLogger('info', { allowClearScreen: false });
      for (const level of ['warn', 'warnOnce', 'error'] as const) {
        logger[level] = (message: string) => said.push(`${level}: ${message}`);
      }
      await resolveConfig(
        { configFile: root('vite.config.ts'), customLogger: logger },
        command,
      );
      expect(said).toEqual([]);
    }, 60_000);
  }
});
