import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import App from './App';
import { CHART, PALETTE } from './palette';

/**
 * A CSS rule that can never match is silent. Nothing throws, nothing warns,
 * the build is green and the only symptom is a box that does not draw — which
 * is exactly how `.hint-bubble .link-note` survived: the link note's whole
 * amber treatment was typed over a hint-bubble rule and kept its prefix, so
 * from the day it landed it styled an element that has never existed.
 *
 * Scoping one class under another is the one selector shape where that
 * happens by accident, because it is the shape you get by editing the wrong
 * half of a selector you copied. So every one of them has to point at
 * something the page actually renders.
 */
/* Read off disk rather than imported: Vite hands an imported `.css` to the
   test as a URL string, and under jsdom `import.meta.url` is an http one. The
   run's cwd is the project root, which is where `vite.config.ts` roots the
   test glob too. */
const stylesheet = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/**
 * Every `.a .b` in the stylesheet, and only those.
 *
 * Pseudo-classes and the other combinators are left out on purpose rather
 * than overlooked: `:hover` and `:has()` describe states this render is not
 * in, and `>`/`+` selectors depend on sibling and child arrangements that a
 * single default render cannot stand in for. What is left is a plain claim
 * about nesting, which `querySelector` can settle outright.
 */
const nestedClassSelectors = (css: string): string[] =>
  (css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g) ?? [])
    .flatMap((prelude) => prelude.split(','))
    .map((selector) => selector.trim().replace(/\s+/g, ' '))
    .filter((selector) => /^\.[\w-]+ \.[\w-]+$/.test(selector));

/**
 * `App.tsx`'s source, for the one question a render cannot answer.
 *
 * A class can be alive and still be absent from a default render — the
 * Breakpoints panel's swatches are behind a button, the link note behind a
 * bad query string — so `querySelector` on one render cannot tell "not drawn
 * yet" from "not drawn ever". The source can, and only because every
 * `className` on this page is a literal string: no template, no helper, no
 * conditional join. The test below asserts that before it relies on it.
 */
const source = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

/** Every class name a selector mentions, wherever in the selector it sits. */
const styledClasses = (css: string): Set<string> =>
  new Set(
    (css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g) ?? [])
      .flatMap((prelude) => Array.from(prelude.matchAll(/\.([\w-]+)/g)))
      .map(([, name]) => name),
  );

describe('the stylesheet', () => {
  it('scopes no rule to a nesting the page never renders', () => {
    const selectors = nestedClassSelectors(stylesheet);
    // Guards the extractor itself: an empty list would pass vacuously.
    expect(selectors.length).toBeGreaterThan(0);

    const { container } = render(<App />);
    const dead = selectors.filter((selector) => !container.querySelector(selector));
    expect(dead).toEqual([]);
  });

  /**
   * The other half of the same silence. A rule scoped to a nesting that never
   * happens is caught above; this catches a rule whose class no render path
   * emits at all, which is what a section leaves behind when its markup is
   * deleted and its stylesheet is not. `.step-intro`, `.answer-share-line`,
   * `.answer-note` and `.chart-key` were four of them at once — every one
   * outliving the element it was written for, and none of them costing a
   * warning to say so.
   */
  it('writes no rule for a class the page never renders', () => {
    // The claim `styledClasses` rests on: className is always a literal here.
    expect(source).not.toMatch(/className=\{/);

    const rendered = new Set(
      Array.from(source.matchAll(/className="([^"]*)"/g)).flatMap(([, list]) =>
        list.split(/\s+/).filter(Boolean),
      ),
    );
    // Guards both extractors: either coming back empty would pass vacuously.
    expect(rendered.size).toBeGreaterThan(20);
    const styled = styledClasses(stylesheet);
    expect(styled.size).toBeGreaterThan(20);

    // recharts names its own SVG parts, and the print sheet re-colours the
    // grid and the ticks by the names the library emits. Nothing in `App.tsx`
    // writes one, and nothing should.
    const dead = Array.from(styled).filter(
      (name) => !rendered.has(name) && !name.startsWith('recharts-'),
    );
    expect(dead).toEqual([]);
  });
});

/**
 * Every rule with a body, and only the innermost ones.
 *
 * `[^{}]*` cannot span a nested `{`, so an `@media` prelude never completes a
 * match and the scan walks past it to the rules inside — which is what makes
 * this safe to run over a stylesheet that has an `@media print` block in it.
 */
const leafRules = (css: string): { selectors: string[]; body: string }[] =>
  Array.from(
    css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ).map(([, prelude, body]) => ({
    selectors: prelude
      .split(',')
      .map((selector) => selector.trim().replace(/\s+/g, ' '))
      .filter(Boolean),
    body,
  }));

/**
 * Two headings used to paint their text with a `linear-gradient` background
 * and knock the glyphs out with `-webkit-text-fill-color: transparent`: the
 * page title and step 3's. On screen that was the effect. On paper, in a
 * browser printing without background graphics, it was the knockout without
 * the paint — both headings came out as blank space, the build stayed green,
 * and nothing anywhere reported it. The print sheet carried two rules whose
 * only job was to undo them.
 *
 * FI Calc paints no text with a gradient, so neither does this page, and the
 * repair rules are gone. What is left is the reason they were needed: a
 * knockout is a heading that a printer is free to drop. So the claim is not
 * that the two are repaired but that there is nothing to repair, which is the
 * shape that stays true as headings are added.
 */
describe('the headings', () => {
  it('paints none of them with a gradient a printer would drop', () => {
    const rules = leafRules(stylesheet);
    // Guards the extractor itself: an empty sheet would pass vacuously.
    expect(rules.length).toBeGreaterThan(50);

    const knockedOut = rules
      .filter((rule) =>
        /-webkit-text-fill-color:\s*transparent|background-clip:\s*text/.test(
          rule.body,
        ),
      )
      .flatMap((rule) => rule.selectors);

    expect(knockedOut).toEqual([]);
  });
});

/**
 * The screen half of the stylesheet: everything ahead of `@media print`.
 *
 * The two halves paint from different palettes on purpose — the screen is
 * near-black with a light ink ramp on it, paper is the other way round — so
 * a claim about where colour comes from has to be made about one of them at
 * a time. This is the screen's.
 */
const screenBlock = (css: string): string => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const print = stripped.indexOf('@media print');
  return print === -1 ? stripped : stripped.slice(0, print);
};

/**
 * A colour written out where it is used rather than named in `:root`.
 *
 * `rgba(var(--accent-rgb), 0.2)` is not one of these and `rgba(56, 189, 248,
 * 0.2)` is, which is why the test is for an `rgb(`/`rgba(` whose first
 * argument is a *number*. Keywords are left alone deliberately:
 * `transparent`, `currentColor` and `none` name a relationship rather than a
 * colour, and there is nothing about them to centralise.
 */
const looseColours = (css: string): string[] =>
  css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d[^)]*\)/g) ?? [];

/**
 * The palette lives in `:root` and nowhere else.
 *
 * This is the invariant that makes a restyle a bounded job instead of an
 * open-ended hunt. Before it, one blue was spelled `#38bdf8` in twenty places
 * across 1,300 lines and in seven more inside `App.tsx`, so "change the
 * accent" meant finding all twenty-seven — and the cost of missing one is
 * silent, because a stale colour still renders.
 *
 * It bites in the direction that actually happens: nobody adds a token they
 * do not use, but everybody pastes a hex into the rule they are already
 * editing. That paste fails here.
 */
describe('the screen stylesheet', () => {
  it('writes every colour it paints with in :root and nowhere else', () => {
    const screen = screenBlock(stylesheet);

    const declared = screen.match(/:root\s*\{[^}]*\}/g) ?? [];
    // Guards the extractor: no `:root` found would make the rest vacuous.
    expect(declared.length).toBeGreaterThan(0);
    expect(looseColours(declared.join('\n')).length).toBeGreaterThan(20);

    const used = declared.reduce((css, block) => css.replace(block, ''), screen);
    expect(looseColours(used)).toEqual([]);
  });
});

/**
 * Every custom property a `:root` block declares, and — of those — the ones
 * whose value is a colour.
 *
 * `--accent-rgb` is a colour and `--measure` is not: the first is a colour
 * written as three numbers so an `rgba()` can take an alpha to it, the second
 * is a length. Which side a token falls on is the difference between
 * something that has to be re-derived for paper and something that means the
 * same on either ground.
 *
 * The two are asymmetric on purpose. What paper *owes* an answer for is every
 * screen token holding a colour; what counts as an answer is the name being
 * declared at all, whatever it is set to. `--shadow-float` is why: on paper
 * it is `none`, which is the right answer and not a colour.
 */
const tokenNames = (css: string): string[] =>
  (css.match(/:root\s*\{[^}]*\}/g) ?? []).flatMap((block) =>
    Array.from(block.matchAll(/(--[\w-]+):/g)).map(([, name]) => name),
  );

const colourTokens = (css: string): string[] =>
  (css.match(/:root\s*\{[^}]*\}/g) ?? []).flatMap((block) =>
    Array.from(block.matchAll(/(--[\w-]+):\s*([^;]+);/g))
      .filter(([, name, value]) => /-rgb$/.test(name) || looseColours(value).length > 0)
      .map(([, name]) => name),
  );

/**
 * The paper half, held to the same line as the screen half.
 *
 * The print sheet used to override the screen's rules one at a time — forty
 * selectors, each restating a rule in a slate literal — because when it was
 * written the colours were spelled where they were used and there was nothing
 * else to re-point. The ground pass put them all in `:root`, and this pass
 * spends that: paper re-declares the tokens and every rule above paints
 * itself.
 *
 * That trades one failure for another, and this is the one it trades to. The
 * old sheet went stale by a screen rule changing and its print twin not; the
 * new one goes stale by a *token* being added to the screen ground and not to
 * the paper one — which is silent in exactly the same way, because a
 * custom property that paper never re-points still resolves, to whatever
 * value the near-black register gave it. `--surface-control` on a printed
 * page would be a #31333f block.
 *
 * So the second `it` is the one that matters, and the first is what keeps the
 * `:root` block the only place worth looking. Only the colour tokens are
 * checked: `--measure`, `--gutter` and the three corners mean the same thing
 * on either ground, and `#root` drops the measures on paper outright.
 */
describe('the print stylesheet', () => {
  it('writes every colour it paints with in :root and nowhere else', () => {
    const print = printBlock(stylesheet);
    // Guards the extractor: an empty block would make both checks vacuous.
    expect(print.length).toBeGreaterThan(500);

    const declared = print.match(/:root\s*\{[^}]*\}/g) ?? [];
    expect(declared).toHaveLength(1);
    expect(looseColours(declared.join('\n')).length).toBeGreaterThan(20);

    const used = declared.reduce((css, block) => css.replace(block, ''), print);
    expect(looseColours(used)).toEqual([]);
  });

  it('answers for every token the screen ground declares', () => {
    const screen = colourTokens(screenBlock(stylesheet));
    // Guards the extractor itself: an empty list would pass vacuously.
    expect(screen.length).toBeGreaterThan(20);

    const paper = new Set(tokenNames(printBlock(stylesheet)));
    expect(screen.filter((name) => !paper.has(name))).toEqual([]);
  });
});

/**
 * `ResponsiveContainer` measures the box it is handed and renders nothing at
 * all when that box is zero high. The print sheet used to hand it zero: it set
 * `height: auto !important` on `.chart-container` and on both recharts divs
 * to scale a screen-sized SVG down to the sheet, the observer fired on the
 * change, and all three chart plots unmounted. Thirty tick values on screen,
 * none on paper — the axis, both sets of tick values and the grid gone, and
 * what printed was an axis label, a key and a caption with nothing between
 * them.
 *
 * Nothing reported it, and nothing could: recharts renders nothing under
 * jsdom either, so no render-based test can tell a chart that is missing from
 * paper apart from one that is missing from the test. What can be checked is
 * the rule that did it, which is the claim here: the print sheet may resize a
 * chart, and may not take its height away.
 */
describe('the print sheet’s charts', () => {
  const chartRules = () =>
    leafRules(printBlock(stylesheet)).filter((rule) =>
      rule.selectors.some((selector) => /chart-container|recharts/.test(selector)),
    );

  it('hands the plot a height it can measure', () => {
    const sized = chartRules().filter((rule) => /(?:^|[;\s])height:/.test(rule.body));
    expect(sized).toHaveLength(1);
    expect(/height:\s*([^;}]+)/.exec(sized[0].body)?.[1].trim()).toMatch(/^\d+px$/);
  });

  it('never resolves that height to nothing', () => {
    const zeroed = chartRules()
      .filter((rule) => /(?:^|[;\s])(?:height|max-height):\s*(auto|0)\b/.test(rule.body))
      .flatMap((rule) => rule.selectors);

    expect(zeroed).toEqual([]);
  });
});

/**
 * `palette.ts` and `:root` are the same palette written twice, once for CSS
 * and once for SVG. Two copies drift — silently, because a stale colour still
 * renders — so the only thing keeping them one palette is this.
 *
 * The direction that matters is a token changed in one file and not the
 * other: the whole reason the tokens exist is that "change the accent" should
 * be one edit, and it is only one edit if a second copy cannot survive it.
 */
/** `surfaceRaised` is `--surface-raised`, and every name pairs that way. */
const custom = (name: string) =>
  `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** Every custom property `:root` declares on screen, name to value. */
const rootTokens = (css: string): Record<string, string> =>
  Object.fromEntries(
    Array.from(
      (screenBlock(css).match(/:root\s*\{[^}]*\}/g) ?? [])
        .join('\n')
        .matchAll(/(--[\w-]+):\s*([^;]+);/g),
    ).map(([, name, value]) => [name, value.trim()]),
  );

describe('the palette', () => {
  it('gives the charts the same colours the stylesheet declares', () => {
    const declared = rootTokens(stylesheet);
    // Guards the extractor: an empty map would make every check below vacuous.
    expect(Object.keys(declared).length).toBeGreaterThan(20);

    const disagreed = Object.entries(PALETTE)
      .map(([name, value]) => ({ name, value, css: declared[custom(name)] }))
      .filter((token) => token.css !== token.value);

    expect(disagreed).toEqual([]);
  });

  /**
   * The check above runs `PALETTE` → CSS, so a token with no `PALETTE` twin is
   * invisible to it. That is the half `--lime-deep` fell through: its only
   * user was the charitable slider, the slider came off with the deduction it
   * set, and the token sat in both `:root` blocks afterwards spent by nothing
   * and named by nothing — the one entry in the block a reader could not
   * account for.
   *
   * So there are exactly two ways a token earns its line: a `var()` somewhere
   * in the sheet, or a `PALETTE` entry, which is a chart spending it in SVG
   * where `var()` cannot reach. `--indigo`, `--lime` and `--emerald` are
   * unspent by CSS and pass on the second — held, with a comment in
   * `palette.ts` saying what they are held for, against the steps that drew
   * them coming back. An unspent token with no such note fails here.
   */
  it('declares no colour with nothing on either side of it', () => {
    const sheet = stylesheet.replace(/\/\*[\s\S]*?\*\//g, '');
    const twins = new Set(Object.keys(PALETTE).map(custom));

    const names = Object.keys(rootTokens(stylesheet));
    expect(names.length).toBeGreaterThan(20);

    const orphaned = names.filter(
      (name) => !sheet.includes(`var(${name})`) && !twins.has(name),
    );
    expect(orphaned).toEqual([]);
  });
});

/**
 * `CHART` is the second copy of two of the page's measures, held to the first
 * the same way `PALETTE` is — by a test, because a stale number renders as
 * quietly as a stale colour.
 *
 * Only two of the five entries have a counterpart in CSS, and they are the
 * two where a disagreement would actually show. The y-axis gutter is one: an
 * SVG that holds back 44px and a caption that indents 44px are describing the
 * same edge, and if they stop agreeing the words under every plot stop
 * starting where the plot does. The label size is the other: 13px inside the
 * plot is `0.8125rem` under it, and the claim this pass made is that a chart
 * and its notes read at one size.
 *
 * The other three — the curve, the rule and the hairline — are stroke widths,
 * which nothing in CSS draws, and `the chart register` in App.chart.test.tsx
 * is what holds those closed instead.
 */
describe('the chart metrics', () => {
  it('holds back the same gutter the notes under the plot indent by', () => {
    const root = (screenBlock(stylesheet).match(/:root\s*\{[^}]*\}/g) ?? []).join('\n');
    expect(/--chart-axis:\s*([^;]+);/.exec(root)?.[1].trim()).toBe(`${CHART.axis}px`);
  });

  it('sets the plot’s labels at the step its notes are set in', () => {
    // 13px is 0.8125rem, and the root font size is the browser's own 16px:
    // `index.css` sets 15px on `body` rather than on `:root` precisely so
    // that every rem length on the page stays where it was put.
    const step = `${CHART.label / 16}rem`;
    expect(step).toBe('0.8125rem');

    // One note, where there were two: the paragraph of key under the plot
    // came off with the Breakpoints panel, which put each swatch beside the
    // switch that draws its line instead.
    const notes = ['.chart-axis-label'];
    const set = leafRules(screenBlock(stylesheet))
      .filter((rule) => rule.selectors.some((selector) => notes.includes(selector)))
      .map((rule) => ({
        selector: rule.selectors.join(', '),
        size: /font-size:\s*([^;}]+)/.exec(rule.body)?.[1].trim(),
      }));
    expect(set).toHaveLength(notes.length);
    expect(set.filter((note) => note.size !== step)).toEqual([]);
  });
});

/**
 * Every size the screen half sets, in the order the file sets them.
 *
 * Comments are stripped first, so the scale written out above `body` in
 * `index.css` is documentation here rather than nine more sizes to check.
 */
const fontSizes = (css: string): string[] =>
  Array.from(css.matchAll(/font-size:\s*([^;}]+)/g)).map(([, size]) => size.trim());

/**
 * Nine steps, and no tenth.
 *
 * They are FI Calc's own, read off its stylesheet: .9375rem body copy, a
 * 1.75rem page title at weight 900, 1.35rem section headings, 1.125rem under
 * those. Before this the page ran a 2.5rem hero and 1.75rem step headings —
 * a register above everything FI Calc uses — and the sizes in between had
 * arrived one rule at a time.
 *
 * It was ten until the controls pass: 1rem was set by a generic `input` rule
 * painting a text field this page has never rendered, and by the one menu
 * this page had, which copied it. Both are gone, and the second `it` below is
 * what caught the step going unspent rather than lingering as a size nothing
 * sets.
 *
 * That is the failure this closes. A scale does not drift by someone
 * rewriting it; it drifts by a 1.05rem typed into the one rule being edited,
 * because from inside that rule there is nothing to compare against. Here
 * there is: a size that is not on the list fails, so widening the scale
 * becomes an edit to the list, made once, on purpose.
 */
describe('the type scale', () => {
  const STEPS = [
    '0.75rem',
    '0.8125rem',
    '0.875rem',
    '0.9375rem',
    '1.125rem',
    '1.25rem',
    '1.35rem',
    '1.5rem',
    '1.75rem',
  ];

  it('sets every size from one closed list of steps', () => {
    const sizes = fontSizes(screenBlock(stylesheet));
    // Guards the extractor itself: an empty list would pass vacuously.
    expect(sizes.length).toBeGreaterThan(20);

    expect([...new Set(sizes)].filter((size) => !STEPS.includes(size)).sort()).toEqual(
      [],
    );
  });

  it('spends every step it declares', () => {
    const spent = new Set(fontSizes(screenBlock(stylesheet)));
    expect(STEPS.filter((step) => !spent.has(step))).toEqual([]);
  });
});

/**
 * Every ring the screen half paints.
 *
 * A ring is an `outline` that is not `none`, or a `box-shadow` with no offset
 * and no blur — `0 0 0 Npx colour`, which is the shape of a border drawn
 * outside the box rather than of a shadow. `--shadow-float` is the one real
 * shadow left on the page and it has both an offset and a blur, so it is not
 * one of these.
 */
const rings = (
  css: string,
): { selectors: string[]; property: string; value: string }[] =>
  leafRules(css).flatMap((rule) => {
    const outline = /(?:^|[;\s])outline:\s*([^;}]+)/.exec(rule.body)?.[1].trim();
    const shadow = /(?:^|[;\s])box-shadow:\s*([^;}]+)/.exec(rule.body)?.[1].trim();
    return [
      ...(outline && outline !== 'none'
        ? [{ selectors: rule.selectors, property: 'outline', value: outline }]
        : []),
      ...(shadow && /^0 0 0 /.test(shadow)
        ? [{ selectors: rule.selectors, property: 'box-shadow', value: shadow }]
        : []),
    ];
  });

/**
 * One ring, and only on focus.
 *
 * Before the controls pass this page rang in three different ways: a 2px
 * `rgba(--accent, 0.2)` glow under the fields, a 2px `rgba(--accent, 0.6)`
 * outline on everything else, and — under the generic `input` rule that has
 * since been deleted — a glow on controls that then had to spend a rule each
 * taking it back off. All three were washes, and a translucent ring over a
 * near-black ground is a smudge: at 0.2 alpha the fields' glow was 1.3:1
 * against the page, which is to say invisible, on the one indicator a
 * keyboard reader has no alternative for.
 *
 * So the claim is the whole register in two parts: nothing rings except on
 * focus, and every ring is the same solid accent. Both fail in the direction
 * that actually happens — a ring pasted into the rule being edited, carrying
 * whatever alpha it had where it was copied from.
 *
 * The second part allows for a ring drawn on a border rather than outside it —
 * FI Calc rings a `.select` that way, by thickening its own border and laying
 * a 1px `box-shadow` in the same accent behind it. Nothing on the page takes
 * that shape today; it stays allowed because it is still one ring in one
 * colour, which is the whole of what these two tests hold.
 */
describe('the controls', () => {
  it('paints a ring in no state but focus', () => {
    const painted = rings(screenBlock(stylesheet));
    // Guards the extractor itself: an empty list would pass vacuously.
    expect(painted.length).toBeGreaterThan(5);

    const unfocused = painted
      .filter((ring) => !ring.selectors.every((s) => s.includes(':focus')))
      .map((ring) => `${ring.selectors.join(', ')} { ${ring.property} }`);

    expect(unfocused).toEqual([]);
  });

  it('paints every ring in the same solid accent', () => {
    const washed = rings(screenBlock(stylesheet))
      .filter((ring) => !/^\d+px solid var\(--accent\)$|var\(--accent\)$/.test(ring.value))
      .map((ring) => `${ring.selectors.join(', ')} { ${ring.property}: ${ring.value} }`);

    expect(washed).toEqual([]);
  });
});

/**
 * The body of one `@media` block, named by its prelude.
 *
 * Read by balancing braces rather than by regex, because a media block is the
 * one thing in this file that nests — `leafRules` walks straight past the
 * prelude and into the rules inside, which is exactly what is wanted
 * everywhere else and not here. `@media print` nests twice over, holding an
 * `@page` of its own, which is the other reason this counts rather than
 * matching.
 */
const mediaBlock = (css: string, prelude: string): string => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = stripped.indexOf(prelude);
  if (at === -1) return '';
  const open = stripped.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < stripped.length; i += 1) {
    if (stripped[i] === '{') depth += 1;
    else if (stripped[i] === '}') {
      depth -= 1;
      if (depth === 0) return stripped.slice(open + 1, i);
    }
  }
  return '';
};

/** The block that collapses the two columns into one. */
const collapseBlock = (css: string): string =>
  mediaBlock(css, '@media (max-width: 992px)');

/** The other ground: the same page on paper. */
const printBlock = (css: string): string => mediaBlock(css, '@media print');

/**
 * Every `width` and `max-width` the screen half sets, with what set it.
 *
 * Two things are left out deliberately rather than overlooked. `min-width` is
 * one: `body` sets a 320px floor, which is a statement about the smallest
 * window this page will try to draw in and not a measure of a column. The
 * other is anything in a rule that clips — `.live-reading` is a box shrunk to
 * a pixel and clipped to nothing so that a live region stays in the
 * accessibility tree while being off the screen, and its 1px is a way of
 * hiding rather than a width.
 */
const widths = (
  css: string,
): { selectors: string[]; property: string; value: string }[] =>
  leafRules(css)
    .filter((rule) => !rule.body.includes('clip-path'))
    .flatMap((rule) =>
      Array.from(
        rule.body.matchAll(/(?:^|[;\s])(max-width|width):\s*([^;}]+)/g),
      ).map(([, property, value]) => ({
        selectors: rule.selectors,
        property,
        value: value.trim(),
      })),
    );

/**
 * Two columns, three measures, and one place they are written down.
 *
 * The shape this page had was a single 900px `#root`, and that one number was
 * doing two jobs at once: it was the reading measure *and* the whole width of
 * the page. So there was nowhere to put a configuration column, and every
 * input ended up stacked at the top of step 1 — which is why a reader looking
 * at step 3's chart could not see the benefit being priced under it.
 *
 * FI Calc's answer is two numbers instead of one: 44rem of reading column and
 * 18rem of configuration beside it. Both are now `:root` tokens and `#root`
 * is derived from them, so the page's width is a consequence of its columns
 * rather than a third number that has to be kept in step with them by hand.
 *
 * The first `it` is what keeps that true. It fails in the direction that
 * actually happens — not by someone rewriting the shell, but by a `900px`
 * typed into whichever rule is being edited, which from inside that rule
 * looks like nothing at all.
 *
 * The second is about the other thing this shape brought with it. Two columns
 * only work while there are two, and the configuration column pins: it sticks
 * to the top of the window while the reading column scrolls past it. The step
 * nav pinned to the head of that reading column until the nav came off the
 * page, which is why the count below is a floor rather than a pair. On a
 * phone there is one column and nothing may pin — a pinned configuration
 * panel there is the whole screen. So every `position: sticky` on this page
 * has to be taken back off in the collapse, and a new one that forgets to is
 * a bug nobody sees on the machine they wrote it on.
 */
describe('the shell', () => {
  const MEASURES = ['--measure', '--column', '--gutter'];

  it('sets every column width from the measures it names, never from a number', () => {
    const drawn = widths(screenBlock(stylesheet));
    // Guards the extractor itself: an empty list would pass vacuously.
    expect(drawn.length).toBeGreaterThan(5);

    const hardCoded = drawn
      .filter((width) => /\d\s*px/.test(width.value))
      .map((width) => `${width.selectors.join(', ')} { ${width.property}: ${width.value} }`);

    expect(hardCoded).toEqual([]);
  });

  it('spends every measure it declares', () => {
    const screen = screenBlock(stylesheet);
    const spent = screen.slice(screen.lastIndexOf(':root'));
    expect(MEASURES.filter((name) => !spent.includes(`var(${name})`))).toEqual([]);
  });

  it('unpins everything that pins where the grid collapses to one', () => {
    const pinned = leafRules(screenBlock(stylesheet))
      .filter((rule) => /position:\s*sticky/.test(rule.body))
      .flatMap((rule) => rule.selectors);
    // Guards the extractor: no sticky found would make the check vacuous.
    expect(pinned.length).toBeGreaterThan(0);

    const released = leafRules(collapseBlock(stylesheet))
      .filter((rule) => /position:\s*static/.test(rule.body))
      .flatMap((rule) => rule.selectors);

    expect(pinned.filter((selector) => !released.includes(selector))).toEqual([]);
  });
});

/** Every left border the screen half draws, with what drew it. */
const leftBorders = (
  css: string,
): { selectors: string[]; property: string; value: string }[] =>
  leafRules(css).flatMap((rule) =>
    Array.from(
      rule.body.matchAll(/(?:^|[;\s])(border-left(?:-color)?):\s*([^;}]+)/g),
    ).map(([, property, value]) => ({
      selectors: rule.selectors,
      property,
      value: value.trim(),
    })),
  );

/**
 * Two shapes of left border, and no third.
 *
 * This page sets something apart in the margin rather than in a box more
 * often than it does anything else: the recap that closes step 1 and each of
 * the six closing figures are a rule and an indent. They arrived one at a
 * time and had drifted into two alphas — 0.5 under the recap, 0.35 beside the
 * figures — which is the same drift `the corners` and `the type scale` were
 * written for, in the one dimension neither of them watches.
 *
 * So: a margin rule is 2px, and its colour is either the page's hairline or a
 * data token at exactly half alpha. A note box is the other shape — 3px of a
 * solid token down the side of something with a fill and a border of its own,
 * which is now only `.link-note`, the separate return's rose `.warning-note`
 * having left with the status that raised it — and it is allowed for
 * explicitly rather than by omission, because the difference between the two
 * is the whole point: one is a rule beside prose, the other is a box.
 */
describe('the margin rules', () => {
  const RULE = /^2px solid (var\(--edge\)|rgba\(var\(--[\w-]+-rgb\), 0\.5\))$/;
  const COLOUR = /^(var\(--edge\)|rgba\(var\(--[\w-]+-rgb\), 0\.5\))$/;
  const BOX = /^3px solid var\(--[\w-]+\)$/;

  it('draws every one of them at one weight and one alpha', () => {
    const drawn = leftBorders(screenBlock(stylesheet));
    // Guards the extractor itself: an empty list would pass vacuously.
    expect(drawn.length).toBeGreaterThan(2);

    const odd = drawn
      .filter((border) =>
        border.property === 'border-left-color'
          ? !COLOUR.test(border.value)
          : !RULE.test(border.value) && !BOX.test(border.value),
      )
      .map((border) => `${border.selectors.join(', ')} { ${border.property}: ${border.value} }`);

    expect(odd).toEqual([]);
  });
});

/** Every corner the screen half draws, one value per `border-radius`. */
const corners = (css: string): string[] =>
  Array.from(css.matchAll(/border-radius:\s*([^;}]+)/g)).flatMap(([, value]) =>
    value.trim().split(/\s+(?![^(]*\))/),
  );

/**
 * Three corners, and no fourth.
 *
 * The same guard as `the type scale`, aimed at the other number that drifts
 * by being typed into the one rule someone is already editing. This page was
 * built on 12px and 16px corners and came down to 8/6/4 in the ground pass;
 * a stray `10px` would not look wrong from inside its own rule, and there is
 * nothing else that would catch it.
 *
 * `50%` was allowed and was never a fourth step — it is a circle, which is a
 * shape rather than a corner. The step nav's numbered discs were the only
 * things that took it, so it left the page with them; a new circle is welcome
 * back on the list, but not by being absent from it.
 */
/**
 * A control nobody can see, in either of its two states.
 *
 * The skip link is the one thing on this page whose whole behaviour is a CSS
 * rule: it is clipped to a pixel at rest and unclipped by `:focus`, and no
 * render test can tell a link that unclips from one that does not, because
 * jsdom computes neither. So it is invisible in every screenshot and every
 * assertion elsewhere, and both ways of breaking it are silent — a resting
 * rule that stops hiding puts a link nobody asked for above the title, and a
 * focus rule that stops showing leaves a keyboard reader tabbing into
 * something they cannot read.
 *
 * `display: none` is called out by name because it is the obvious way to
 * write the first half and the wrong one: it takes the tab stop away with the
 * pixels, and a skip link that cannot be tabbed to is not a skip link.
 */
describe('the skip link', () => {
  const rule = (selector: string) =>
    leafRules(screenBlock(stylesheet)).find((r) => r.selectors.includes(selector));

  it('is clipped at rest and unclipped by focus', () => {
    const resting = rule('.skip-link');
    const focused = rule('.skip-link:focus');
    expect(resting).toBeDefined();
    expect(focused).toBeDefined();

    expect(resting?.body).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(resting?.body).not.toMatch(/display:\s*none/);
    expect(focused?.body).toMatch(/clip-path:\s*none/);
  });

  /**
   * And drawn over everything, because what it unclips onto is whatever the
   * reader had already opened.
   */
  it('lands above every other layer the page stacks', () => {
    const layers = Array.from(
      screenBlock(stylesheet).matchAll(/z-index:\s*(\d+)/g),
    ).map(([, value]) => Number(value));
    // Guards the extractor itself: an empty list would pass vacuously.
    expect(layers.length).toBeGreaterThan(2);

    const focused = Number(/z-index:\s*(\d+)/.exec(rule('.skip-link:focus')?.body ?? '')?.[1]);
    expect(focused).toBe(Math.max(...layers));
  });
});

describe('the corners', () => {
  const STEPS = ['var(--radius-lg)', 'var(--radius-md)', 'var(--radius-sm)', '0'];

  it('rounds every box from one closed list of steps', () => {
    const drawn = corners(screenBlock(stylesheet));
    // Guards the extractor itself: an empty list would pass vacuously.
    expect(drawn.length).toBeGreaterThan(10);

    expect([...new Set(drawn)].filter((step) => !STEPS.includes(step)).sort()).toEqual(
      [],
    );
  });

  it('spends every step it declares', () => {
    const drawn = new Set(corners(screenBlock(stylesheet)));
    expect(STEPS.filter((step) => !drawn.has(step))).toEqual([]);
  });
});
