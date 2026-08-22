import '@testing-library/jest-dom/vitest';

/**
 * Every test starts at a bare address.
 *
 * The page now writes the whole return into the query string and reads it back
 * on mount (see `scenarioUrl`), and jsdom keeps one `location` for a whole
 * file — so without this, the return a test left behind would become the
 * return the next test's `render(<App />)` opens with.
 *
 * Guarded because this file is setup for every test, and the ones that read
 * build configuration rather than the page run under `node` — where there is
 * no address to reset and importing the config would break jsdom's own
 * `TextEncoder` against esbuild's.
 */
beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.history.replaceState(null, '', '/');
  }
});
