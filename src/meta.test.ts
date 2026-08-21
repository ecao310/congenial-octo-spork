import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { marginalRateCurve, incomeAxisMax } from './utils/tax';
import { defaultScenario } from './utils/scenarioUrl';

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
    const css = readFileSync(root('src/index.css'), 'utf8');
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
      qcd: opening.qcd,
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
