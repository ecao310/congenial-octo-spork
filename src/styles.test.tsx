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
 * Nine steps, and no tenth.
 *
 * They are FI Calc's own, read off its stylesheet: .9375rem body copy, a
 * 1.75rem page title at weight 900, 1.35rem section headings, 1.125rem under
 * those. Before this the page ran a 2.5rem hero and 1.75rem step headings —
 * a register above everything FI Calc uses — and the sizes in between had
 * arrived one rule at a time.
 *
 * It was ten until the controls pass: 1rem was set by a generic `input` rule
 * painting a text field this page has never rendered, and by the state menu
 * copying it. Both are gone, and the second `it` below is what caught the
 * step going unspent rather than lingering as a size nothing sets.
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
 * Fields are the exception the second part allows for and the first does not:
 * FI Calc rings a `.select` by thickening its own border rather than by
 * laying an outline around it, so `.state-select:focus` sets `border-color`
 * and a 1px `box-shadow` in the same accent. That is still one ring in one
 * colour; it is drawn on the border rather than outside it.
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
 * The body of the one `@media` block that collapses the two columns into one.
 *
 * Found by name and read by balancing braces rather than by regex, because a
 * media block is the one thing in this file that nests — `leafRules` walks
 * straight past the prelude and into the rules inside, which is exactly what
 * is wanted everywhere else and not here.
 */
const collapseBlock = (css: string): string => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = stripped.indexOf('@media (max-width: 992px)');
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
 * only work while there are two, and both of them pin: the configuration
 * sticks to the top of the window and the nav sticks to the head of the
 * reading column. On a phone there is one column and nothing may pin — a
 * pinned configuration panel there is the whole screen, and a nav that wraps
 * to two rows takes a third of what is left. So every `position: sticky` on
 * this page has to be taken back off in the collapse, and a new one that
 * forgets to is a bug nobody sees on the machine they wrote it on.
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

  it('unpins both columns where the grid collapses to one', () => {
    const pinned = leafRules(screenBlock(stylesheet))
      .filter((rule) => /position:\s*sticky/.test(rule.body))
      .flatMap((rule) => rule.selectors);
    // Guards the extractor: no sticky found would make the check vacuous.
    expect(pinned.length).toBeGreaterThan(1);

    const released = leafRules(collapseBlock(stylesheet))
      .filter((rule) => /position:\s*static/.test(rule.body))
      .flatMap((rule) => rule.selectors);

    expect(pinned.filter((selector) => !released.includes(selector))).toEqual([]);
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
 * `50%` is allowed and is not a fourth step — it is a circle, which is a
 * shape rather than a corner, and the step nav's numbers are the only things
 * that take it.
 */
describe('the corners', () => {
  const STEPS = ['var(--radius-lg)', 'var(--radius-md)', 'var(--radius-sm)', '50%', '0'];

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
