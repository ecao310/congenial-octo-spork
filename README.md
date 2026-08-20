# Growth Projector

See peaks and valleys of marginal tax rates, and how they interact with LTCG and the 50-85% rule.

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

Every push to `dev` publishes a preview of the dev branch alongside it, at
https://ecao310.github.io/congenial-octo-spork/preview/ . The repo only has one
Pages site, so `.github/workflows/deploy-preview.yml` rebuilds main's site
verbatim and nests the dev build underneath it. The production URL always
serves `main`; `dev` never needs to be merged to be seen.
