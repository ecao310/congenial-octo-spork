import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { marginalRateCurve, incomeAxisMax } from '../lib/tax';
import { defaultScenario } from '../lib/scenarioUrl';

/**
 * What the link says about itself before anyone opens it.
 *
 * Everything here lives in files no test otherwise reads — `index.html`,
 * `public/`, and a generator script that CI never runs — which is exactly why
 * it needs holding down. A `<meta>` tag cannot fail: a typo'd property name, a
 * relative `og:image` a crawler will not resolve, an image whose declared size
 * stopped matching the file, a favicon href pointing at an asset that was
 * deleted — every one of them renders a perfectly valid page and shows up
 * only in someone else's chat window, days later, as a bare URL.
 *
 * Read off disk for the same reason `the stylesheet` reads `index.css` off
 * disk: these are not modules, so there is nothing to import. The run's cwd
 * is the project root, which is where `vite.config.ts` roots the test glob.
 */
const root = (path: string) => resolve(process.cwd(), path);
const html = readFileSync(root('index.html'), 'utf8');

/** Every `<meta>` in the document, by whichever of `property`/`name` it uses. */
const metaTags: Record<string, string> = Object.fromEntries(
  (html.match(/<meta\s[^>]*>/g) ?? []).flatMap((tag) => {
    const key = /(?:property|name)="([^"]+)"/.exec(tag)?.[1];
    const content = /content="([^"]*)"/s.exec(tag)?.[1];
    return key && content !== undefined ? [[key, content]] : [];
  }),
);

/** Every `href` the document asks the origin for. */
const hrefs = (html.match(/href="([^"]+)"/g) ?? []).map((h) => h.slice(6, -1));

/**
 * A PNG's own idea of its size, straight out of the IHDR chunk: 8 bytes of
 * signature, then a 4-byte length and the `IHDR` tag, then width and height as
 * big-endian 32-bit integers. Cheaper than a dependency, and it is the only
 * figure that can disagree with `og:image:width` without anything else noticing.
 */
const pngSize = (path: string) => {
  const png = readFileSync(root(path));
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
};

describe('the link preview', () => {
  it('names itself, describes itself and carries a card', () => {
    expect(metaTags['og:type']).toBe('website');
    expect(metaTags['og:site_name']).toBeTruthy();
    expect(metaTags['og:title']).toBeTruthy();
    expect(metaTags['og:description']).toBeTruthy();
    expect(metaTags['og:url']).toBeTruthy();
    expect(metaTags['og:image']).toBeTruthy();
    expect(metaTags['og:image:alt']).toBeTruthy();
    expect(metaTags['twitter:card']).toBe('summary_large_image');
  });

  it('says the same thing on both surfaces', () => {
    expect(metaTags['twitter:title']).toBe(metaTags['og:title']);
    expect(metaTags['twitter:description']).toBe(metaTags['og:description']);
    expect(metaTags['twitter:image']).toBe(metaTags['og:image']);
  });

  /* Slack and iMessage cut a preview's second line off somewhere around 200
     characters, and a description that ends mid-clause reads worse than a
     shorter one that finishes its sentence. */
  it('keeps the description short enough to be shown whole', () => {
    expect(metaTags['og:description'].length).toBeLessThanOrEqual(200);
  });

  /* A crawler fetches the card out of band, with no page to resolve a
     relative path against. `%BASE_URL%` is how the origin-relative half stays
     right in both builds — vite writes `/congenial-octo-spork/` into
     production and `/congenial-octo-spork/preview/` into the preview, so the
     preview's card is its own rather than production's. */
  it('gives the crawler absolute URLs, built through the base', () => {
    for (const key of ['og:url', 'og:image', 'twitter:image']) {
      expect(metaTags[key]).toMatch(/^https:\/\/[^/]+%BASE_URL%/);
    }
  });

  it('asks the origin for nothing outside the base', () => {
    for (const href of hrefs) {
      expect(href.startsWith('/') && !href.startsWith('//')).toBe(false);
    }
  });
});

describe('the cover', () => {
  const shipped = ['public/og-cover.png', 'public/apple-touch-icon.png', 'public/favicon.svg'];

  it('ships every file the document links to', () => {
    const linked = [
      ...hrefs.filter((h) => h.startsWith('%BASE_URL%')).map((h) => h.replace('%BASE_URL%', '')),
      metaTags['og:image'].replace(/^https:\/\/[^/]+%BASE_URL%/, ''),
    ];
    for (const file of linked) {
      expect(existsSync(root(`public/${file}`))).toBe(true);
    }
    for (const file of shipped) {
      expect(existsSync(root(file))).toBe(true);
    }
  });

  /* An og:image whose declared size is wrong is worse than one with no size
     declared: Slack lays the card out from the numbers before the bytes
     arrive, and then reflows. So the numbers are read back off the file. */
  it('declares the size the file actually is', () => {
    const { width, height } = pngSize('public/og-cover.png');
    expect(width).toBe(1200);
    expect(height).toBe(630);
    expect(metaTags['og:image:width']).toBe(String(width));
    expect(metaTags['og:image:height']).toBe(String(height));
  });

  it('rasterises the touch icon at the size iOS asks for', () => {
    expect(pngSize('public/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
  });

  /**
   * The mark, the card and the browser chrome are all painted in the page's
   * own two colours, and none of the three files can read `:root` — an SVG
   * attribute takes a literal, and a `<meta>` tag takes a string. Same
   * argument `palette.ts` makes about the charts, and the same remedy: the
   * copies are held together by a test that reads the original.
   */
  it('is painted in the palette the page is', () => {
    const css = readFileSync(root('src/styles/index.css'), 'utf8');
    const token = (name: string) =>
      new RegExp(`--${name}:\\s*(#[0-9a-f]{3,8})`, 'i').exec(css)?.[1] ?? `--${name} is missing`;
    const surface = token('surface');
    const accent = token('accent');

    for (const file of ['public/favicon.svg', 'scripts/og-cover.mjs']) {
      const source = readFileSync(root(file), 'utf8');
      expect(source).toContain(surface);
      expect(source).toContain(accent);
    }
    expect(metaTags['theme-color']).toBe(surface);
  });

  /**
   * The card quotes a rate. It is drawn from `marginalRateCurve` rather than
   * by hand for exactly this reason — but the *description* beside it is
   * prose, and prose does not get redrawn when a bracket moves. So the figure
   * the copy names has to still be the figure the arithmetic reaches on the
   * scenario the page opens on. If this fails, the numbers moved: re-run
   * `node scripts/og-cover.mjs` and re-read the sentence.
   */
  it('quotes a rate the opening scenario still reaches', () => {
    const opening = defaultScenario();
    const scenario = {
      filingStatus: opening.filingStatus,
      ssBenefit: opening.ssBenefit,
      isSenior: opening.isSenior,
      spouseIsSenior: opening.spouseIsSenior,
      muniInterest: opening.muniInterest,
    };
    const curve = marginalRateCurve(scenario, { maxIncome: incomeAxisMax(scenario), step: 250 });

    const fallBack = curve.findIndex((p, i) => i > 0 && p.marginalRate < curve[i - 1].marginalRate);
    expect(fallBack).toBeGreaterThan(0);
    const hump = curve[fallBack - 1].marginalRate;
    const valley = curve[fallBack].marginalRate;

    expect(metaTags['og:description']).toContain(`${hump}%`);
    expect(metaTags['og:description']).toContain(`${valley}%`);
    expect(metaTags['og:image:alt']).toContain(`${hump}%`);
  });
});

/**
 * What a search engine reads, which is not what a chat window reads.
 *
 * `the link preview` above holds `og:` and `twitter:` against each other, so
 * the two of them cannot drift apart — but `name="description"` is a third
 * surface, checked against neither, and it spent two backlogs advertising
 * capital-gains stacking after the step came off the page. Every part of that
 * failure is silent: the tag is well-formed, the page renders, and the only
 * reader who sees the promise broken arrives from a result page.
 *
 * So the copy is held against the page rather than against the other tags.
 * The snippet ends on the list of sections it promises; this reads that list
 * back out of the prose and looks for each entry in a heading the rendered app
 * actually has. Naming a section that came off the page therefore fails here,
 * and so does taking a section off the page without rewriting the tag.
 */
describe('the search snippet', () => {
  const description = metaTags['description'];

  /**
   * The sections the snippet promises: everything after the last colon, split
   * on the list's own punctuation. Parsed rather than duplicated so that the
   * copy stays a sentence someone would write, and so that rewriting it is
   * enough — there is no second list to keep in step.
   */
  const advertised = (sentence: string) =>
    sentence
      .slice(sentence.lastIndexOf(':') + 1)
      .replace(/\.\s*$/, '')
      .split(/,\s*|\s+and\s+/)
      .map((topic) => topic.trim().toLowerCase())
      .filter(Boolean);

  /* Google shows about 160 characters of a description and cuts the rest, and
     a promise cut in half is worse than a shorter one that lands. The share
     card gets its own, looser limit above: chat previews are wider. */
  it('is short enough to be shown whole on a result page', () => {
    expect(description).toBeTruthy();
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it('promises only sections the page still has', () => {
    render(createElement(App));
    const headings = screen.getAllByRole('heading').map((h) => h.textContent?.toLowerCase() ?? '');

    const topics = advertised(description);
    expect(topics.length).toBeGreaterThan(1);
    for (const topic of topics) {
      // Falls back to a sentence rather than `undefined` so a failure reads as
      // the topic against the page rather than as a lookup that missed. The
      // sentence must not itself contain the topic, or `toContain` passes on
      // the fallback and the assertion checks nothing.
      expect(headings.find((h) => h.includes(topic)) ?? 'no heading on the page says').toContain(
        topic,
      );
    }
  });
});

/**
 * The repo's own front door, which is a different surface from the page's.
 *
 * `README.md:12` named the bare Pages URL as **Live:** for the whole rewrite.
 * That URL served `main`, which was seventy-odd commits behind `dev` and still
 * opened as *Marginal Tax Rate* out of a package called `growth-projector`, so
 * every reader who followed the front-door link landed on the app this one was
 * rewritten out of. Nothing caught it because nothing here read `README.md`
 * and no build breaks: both URLs were live, both returned 200, and the wrong
 * one was a perfectly good page.
 *
 * The fix is a link, and a link rots the moment the branch under it moves. So
 * this reads the README's own account of what deploys where — every "push to
 * `branch`" sentence in its Deployment section, paired with the Pages URL that
 * sentence gives — finds the workflow that fires on each branch, and derives
 * the URL that workflow actually publishes to: `--base=` if the job overrides
 * it, `vite.config.ts`'s `base` if it does not. **Live:** must then be one of
 * the URLs the README says a branch publishes. Retiring a branch, adding a
 * workflow, or moving a base path therefore turns red here until the README
 * says so too.
 */
describe('the front door', () => {
  const readme = readFileSync(root('README.md'), 'utf8');
  const ORIGIN = 'https://ecao310.github.io';

  /** The URL under **Live:**. */
  const liveUrl = /^\*\*Live:\*\*\s+(\S+)/m.exec(readme)?.[1];

  /**
   * What the README says deploys where: each branch its Deployment section
   * names in a "push to `branch`" sentence, with the first Pages URL that
   * follows it. Non-greedy so that each URL is claimed by the nearest branch
   * before it rather than the first one in the section.
   */
  const deployment = readme.slice(readme.indexOf('## Deployment'));
  const described = [
    ...deployment.matchAll(
      new RegExp(`push to \`([\\w.-]+)\`[\\s\\S]*?(${ORIGIN}/[\\w./-]*)`, 'g'),
    ),
  ].map(([, branch, url]) => ({ branch, url: url.endsWith('/') ? url : `${url}/` }));

  /**
   * Every deploy workflow, as the branch it fires on and the base path it
   * hands the build. `deploy-preview.yml` passes `--base=` on the command
   * line; `deploy.yml` runs `npm run build` and takes vite.config's.
   */
  const configBase = /^\s*base:\s*'([^']+)'/m.exec(
    readFileSync(root('vite.config.ts'), 'utf8'),
  )?.[1];

  const workflows = readdirSync(root('.github/workflows')).map((file) => {
    const yaml = readFileSync(root(`.github/workflows/${file}`), 'utf8');
    return {
      file,
      branches: (/branches:\s*\[([^\]]*)\]/.exec(yaml)?.[1] ?? '')
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean),
      base: /--base=(\S+)/.exec(yaml)?.[1] ?? configBase,
    };
  });

  it('says which branches deploy, and where', () => {
    expect(liveUrl).toBeDefined();
    expect(configBase).toBe('/congenial-octo-spork/');
    expect(workflows.length).toBeGreaterThan(1);
    expect(described.length).toBeGreaterThan(0);

    // Every branch a workflow fires on is one the README describes, and the
    // other way round — sorted, so a diff names the branch rather than the
    // order.
    const documented = described.map((d) => d.branch).sort();
    const deploying = workflows.flatMap((w) => w.branches).sort();
    expect(documented).toEqual(deploying);
  });

  it('gives each branch the URL its workflow publishes', () => {
    for (const { branch, url } of described) {
      // Named by workflow file rather than counted, so a failure says which
      // ones fired on the branch instead of only how many did.
      const deploying = workflows.filter((w) => w.branches.includes(branch));
      expect(deploying.map((w) => w.file)).toHaveLength(1);

      // Compared as paths: the origin is asserted on its own, and a whole-URL
      // diff is long enough that vitest elides the half that differs.
      expect(url.startsWith(`${ORIGIN}/`)).toBe(true);
      expect({ branch, base: url.slice(ORIGIN.length) }).toEqual({
        branch,
        base: deploying[0].base,
      });
    }
  });

  it('points Live: at a URL some branch publishes', () => {
    expect(described.map((d) => d.url)).toContain(liveUrl);
  });

  it('names no Pages URL that no workflow publishes', () => {
    const published = new Set(workflows.map((w) => `${ORIGIN}${w.base}`));
    const named = new Set(
      (readme.match(new RegExp(`${ORIGIN}/[\\w./-]*`, 'g')) ?? []).map((u) =>
        u.endsWith('/') ? u : `${u}/`,
      ),
    );

    expect([...named].filter((u) => !published.has(u))).toEqual([]);
    expect(named).toEqual(published);
  });
});
