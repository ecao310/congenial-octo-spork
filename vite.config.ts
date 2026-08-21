import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Which chunk a bundled module belongs in.
 *
 * Left alone, this app builds as one 576 kB file and every build closes with
 * Vite's "some chunks are larger than 500 kB" warning. Three quarters of that
 * file is recharts and the tree under it — the chart library, its redux store,
 * its d3 scales — and none of it is app code.
 *
 * The fix is not to defer it. The chart is the top of the main column and it
 * is the answer the page exists to give, so a dynamic `import()` would buy a
 * faster first paint of an empty box and pay for it with a render waterfall in
 * front of the one thing the reader came for — a chunk behind an `import()`
 * cannot be asked for until React has mounted the component that asks. What is
 * wrong with a single 576 kB chunk is its granularity, not its size: every
 * deploy of this repo changes app code and nothing else, and today that
 * re-downloads recharts and React along with it.
 *
 * So: three static chunks, layered app -> charts -> react. Vite writes a
 * `modulepreload` for each into index.html, so a first-time reader still
 * fetches all three in parallel off one HTML parse and pays nothing for the
 * split; a returning one fetches the ~66 kB that changed and keeps the rest by
 * content hash. Both vendor chunks are under the 500 kB line, which is what
 * retires the warning rather than silencing it with `chunkSizeWarningLimit`.
 *
 * The rule reads "everything in node_modules that is not React is the chart
 * library" because recharts is the only other runtime dependency in
 * package.json. That is an invariant, not an observation, and `the build's
 * chunking` in src/build.test.ts fails the moment a fourth dependency makes it
 * untrue — at which point this rule needs a name that is still honest.
 */
export function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined
  return /node_modules\/(react|react-dom|react-is|scheduler)\//.test(id)
    ? 'react'
    : 'charts'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/congenial-octo-spork/',
  build: {
    rollupOptions: {
      output: { manualChunks },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
