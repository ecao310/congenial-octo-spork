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

/** The body of the `@media print` block, braces matched rather than counted. */
const printBlock = (css: string): string => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const open = stripped.indexOf('{', stripped.indexOf('@media print'));
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < stripped.length; i += 1) {
    if (stripped[i] === '{') depth += 1;
    else if (stripped[i] === '}' && (depth -= 1) === 0)
      return stripped.slice(open + 1, i);
  }
  return '';
};

/**
 * Two headings on this page paint their text with a `linear-gradient`
 * background and knock the glyphs out with
 * `-webkit-text-fill-color: transparent`: the page title and step 3's
 * heading. On screen that is the effect. On paper, in a browser printing
 * without background graphics, it is the knockout without the paint — both
 * headings come out as blank space, the build stays green, and nothing
 * anywhere reports it.
 *
 * The pairing is mechanical, so it is checked mechanically rather than
 * remembered: anything that goes transparent has to be given its colour back
 * inside `@media print`. A third gradient heading fails here until it is.
 */
describe('the print stylesheet', () => {
  it('gives every gradient-painted heading its colour back', () => {
    const knockedOut = leafRules(stylesheet)
      .filter((rule) => /-webkit-text-fill-color:\s*transparent/.test(rule.body))
      .flatMap((rule) => rule.selectors);
    // Guards the extractor itself: finding none would pass vacuously.
    expect(knockedOut.length).toBeGreaterThan(0);

    const restored = new Set(
      leafRules(printBlock(stylesheet))
        .filter((rule) =>
          /-webkit-text-fill-color:\s*(?!transparent)\S/.test(rule.body),
        )
        .flatMap((rule) => rule.selectors),
    );

    expect(knockedOut.filter((selector) => !restored.has(selector))).toEqual([]);
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
