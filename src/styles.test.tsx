import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import App from './App';
import { PALETTE } from './palette';

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

describe('the stylesheet', () => {
  it('scopes no rule to a nesting the page never renders', () => {
    const selectors = nestedClassSelectors(stylesheet);
    // Guards the extractor itself: an empty list would pass vacuously.
    expect(selectors.length).toBeGreaterThan(0);

    const { container } = render(<App />);
    const dead = selectors.filter((selector) => !container.querySelector(selector));
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
 * `palette.ts` and `:root` are the same palette written twice, once for CSS
 * and once for SVG. Two copies drift — silently, because a stale colour still
 * renders — so the only thing keeping them one palette is this.
 *
 * The direction that matters is a token changed in one file and not the
 * other: the whole reason the tokens exist is that "change the accent" should
 * be one edit, and it is only one edit if a second copy cannot survive it.
 */
describe('the palette', () => {
  it('gives the charts the same colours the stylesheet declares', () => {
    const root = (screenBlock(stylesheet).match(/:root\s*\{[^}]*\}/g) ?? []).join(
      '\n',
    );
    const declared = Object.fromEntries(
      Array.from(root.matchAll(/(--[\w-]+):\s*([^;]+);/g)).map(([, name, value]) => [
        name,
        value.trim(),
      ]),
    );
    // Guards the extractor: an empty map would make every check below vacuous.
    expect(Object.keys(declared).length).toBeGreaterThan(20);

    /** `surfaceRaised` is `--surface-raised`, and every name pairs that way. */
    const custom = (name: string) =>
      `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

    const disagreed = Object.entries(PALETTE)
      .map(([name, value]) => ({ name, value, css: declared[custom(name)] }))
      .filter((token) => token.css !== token.value);

    expect(disagreed).toEqual([]);
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
 * Ten steps, and no eleventh.
 *
 * They are FI Calc's own, read off its stylesheet: .9375rem body copy, a
 * 1.75rem page title at weight 900, 1.35rem section headings, 1.125rem under
 * those. Before this the page ran a 2.5rem hero and 1.75rem step headings —
 * a register above everything FI Calc uses — and the sizes in between had
 * arrived one rule at a time.
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
    '1rem',
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
