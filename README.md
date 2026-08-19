# Growth Projector

A minimal single-input webapp: enter an initial amount and see its projected
compound growth at 7% per year over 30 years, charted with Recharts.

Built with Vite + React + TypeScript, tested with Vitest, and deployed to
GitHub Pages via GitHub Actions.

## Development

```bash
npm install
npm run dev      # start dev server
npm run test     # run tests
npm run build    # type-check and build for production
```

## Deployment

Every push to `main` runs tests, builds the app, and deploys it to GitHub
Pages: https://ecao310.github.io/congenial-octo-spork/
