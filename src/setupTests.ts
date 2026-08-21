import '@testing-library/jest-dom';

/**
 * Every test starts at a bare address.
 *
 * The page now writes the whole return into the query string and reads it back
 * on mount (see `scenarioUrl`), and jsdom keeps one `location` for a whole
 * file — so without this, the return a test left behind would become the
 * return the next test's `render(<App />)` opens with.
 */
beforeEach(() => {
  window.history.replaceState(null, '', '/');
});
