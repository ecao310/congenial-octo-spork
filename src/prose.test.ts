import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * A backslash-u-2014 is an em dash inside a JavaScript string and six literal
 * characters inside JSX. Nothing tells the two apart at the call site — the
 * same six characters sit in the same file a line apart, one of them right —
 * so the compiler is happy, the linter is happy, and the only symptom is a
 * backslash on the page.
 *
 * That is how the state selector shipped its first option reading
 * `Somewhere else \u2014 or rather not say`, in 7aa0e66, and kept it for
 * fourteen commits: the sites read as prose in the diff, the substring
 * assertions that cover two of them stop before the dash, and no test on this
 * page asserts a whole sentence.
 *
 * The claim here is deliberately wider than that one escape. A backslash in
 * JSX text or in a JSX attribute's string literal is a typed escape sequence
 * that will not fire, near enough to always that the exception is worth
 * spelling `{'\\'}` when it ever arrives.
 */

const SOURCE_ROOT = resolve(process.cwd(), 'src');

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? tsxFiles(join(dir, entry.name))
      : entry.name.endsWith('.tsx')
        ? [join(dir, entry.name)]
        : [],
  );

type Site = { where: string; text: string };

/**
 * Walks every `.tsx` under `src`, handing each JSX text node and each JSX
 * attribute written as a plain string to the caller. Both are positions where
 * the source text reaches the reader verbatim; a `{'...'}` expression
 * attribute is a real string literal and is left alone.
 *
 * `sentence` is the third position prose reaches the reader from: the string
 * literals inside `{cond ? '…' : '…'}`, which is how every gloss that
 * changes with the return is written. Four words is enough of a filter to
 * leave class names, ids and `'mfj'` out of it.
 */
const jsxLiterals = (): { text: Site[]; attribute: Site[]; sentence: Site[] } => {
  const text: Site[] = [];
  const attribute: Site[] = [];
  const sentence: Site[] = [];

  for (const file of tsxFiles(SOURCE_ROOT)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const at = (node: ts.Node) =>
      `${relative(process.cwd(), file)}:${
        source.getLineAndCharacterOfPosition(node.getStart()).line + 1
      }`;

    const visit = (node: ts.Node): void => {
      if (ts.isJsxText(node)) {
        text.push({ where: at(node), text: node.getText() });
      }
      if (
        ts.isJsxAttribute(node) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      ) {
        attribute.push({ where: at(node), text: node.getText() });
      }
      if (
        ts.isStringLiteral(node) &&
        !ts.isJsxAttribute(node.parent) &&
        !ts.isImportDeclaration(node.parent) &&
        node.text.split(' ').length >= 4
      ) {
        sentence.push({ where: at(node), text: node.text });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return { text, attribute, sentence };
};

/** Trimmed and collapsed, so a failure names the sentence rather than a block of indentation. */
const quote = (site: Site) =>
  `${site.where}: ${site.text.trim().replace(/\s+/g, ' ').slice(0, 90)}`;

describe('the page’s own words', () => {
  it('leaves no escape sequence sitting in prose the reader can see', () => {
    const { text } = jsxLiterals();
    // Guards the walk itself: an empty list would pass vacuously.
    expect(text.length).toBeGreaterThan(100);

    expect(
      text.filter((site) => site.text.includes('\\')).map(quote),
    ).toEqual([]);
  });

  it('leaves none in an attribute either, where a screen reader would read it', () => {
    const { attribute } = jsxLiterals();
    expect(attribute.length).toBeGreaterThan(50);

    expect(
      attribute.filter((site) => site.text.includes('\\')).map(quote),
    ).toEqual([]);
  });

  /**
   * The page is not the subject. A reader came for what a year of this return
   * costs, and a sentence about the page instead — what it opens on, what it
   * has no field for, why a chart is worth drawing, which edge moves when a
   * slider does — is an answer to a question nobody asked, in a register that
   * spreads: every one of these started as a note explaining a change, and by
   * the time there were nine of them they read as the page apologising for
   * itself.
   *
   * The exception is the link. Sending this page *is* a thing the page does,
   * and the share note and the banner that catches a link asking for a return
   * this page cannot show both have to say so. Both name the link, which is
   * what the allowance keys on.
   */
  it('makes the return its subject, not the page showing it', () => {
    const { text, sentence } = jsxLiterals();
    // A test's own name is prose about the page by definition, and none of it
    // is rendered.
    const shipped = [...text, ...sentence].filter(
      (site) => !site.where.includes('.test.'),
    );
    expect(shipped.length).toBeGreaterThan(100);

    expect(
      shipped
        .filter(
          (site) =>
            /\b(?:this|the) page\b/i.test(site.text) && !/\blink\b/i.test(site.text),
        )
        .map(quote),
    ).toEqual([]);
  });
});
