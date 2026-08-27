import { render, screen, within, fireEvent } from '@testing-library/react';
import App from './App';
import { FURTHER_READING } from './lib/furtherReading';
import { pinPageYear } from './test/pageFixtures';

/**
 * The reading list under the footer's rule: where it sits, that it is a note
 * like the others — closed until asked for — that every entry on the list
 * reaches the page as a link and nothing else does, and that each link
 * leaves in the plain way — same tab, https, one address each.
 */

pinPageYear();

describe('the further reading', () => {
  const reading = (): HTMLElement =>
    document.getElementById('reading') as HTMLElement;
  const summary = (): HTMLElement =>
    reading().querySelector('summary') as HTMLElement;
  const links = (): HTMLAnchorElement[] =>
    within(reading()).getAllByRole('link') as HTMLAnchorElement[];

  /**
   * In the footer and not the main, because the close is the last thing in
   * the main and `App.answer.test.tsx` holds it there; ahead of the disclaimer,
   * because the disclaimer is the last word.
   */
  it('sits in the footer, ahead of the disclaimer, and outside the main', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /further reading/i, level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toContainElement(reading());
    expect(screen.getByRole('main')).not.toContainElement(reading());

    const disclaimer = reading().nextElementSibling;
    expect(disclaimer).toHaveTextContent(
      /does not constitute tax or financial advice/i,
    );
    expect(reading().parentElement?.lastElementChild).toBe(disclaimer);
  });

  /**
   * A note like the five in step 2: a `<details>` that starts closed, whose
   * summary is the heading and nothing else, so the row a reader clicks is
   * the row they read.
   */
  it('is a closed note, opened from its heading', () => {
    render(<App />);
    expect(reading().tagName).toBe('DETAILS');
    expect(reading()).not.toHaveAttribute('open');
    expect(summary()).toContainElement(
      screen.getByRole('heading', { name: /further reading/i }),
    );
    expect(summary().textContent?.trim()).toBe('Further reading');

    fireEvent.click(summary());
    expect(reading()).toHaveAttribute('open');
    fireEvent.click(summary());
    expect(reading()).not.toHaveAttribute('open');
  });

  /**
   * Three, exactly: one from Fidelity, one from the IRS, one other. The brief
   * was a short list, and a list that is checked only for being non-empty is
   * a list that grows.
   */
  it('links every entry on the list, in its order, and nothing else', () => {
    render(<App />);
    expect(FURTHER_READING).toHaveLength(3);
    expect(FURTHER_READING.map((r) => r.source)).toEqual(
      expect.arrayContaining(['Fidelity', 'IRS']),
    );
    expect(links().map((a) => a.getAttribute('href'))).toEqual(
      FURTHER_READING.map((r) => r.href),
    );
    expect(links().map((a) => a.textContent)).toEqual(
      FURTHER_READING.map((r) => r.title),
    );
  });

  it('names a source beside every title', () => {
    render(<App />);
    for (const { title, source } of FURTHER_READING) {
      expect(
        screen.getByRole('link', { name: title }).closest('li'),
      ).toHaveTextContent(source);
    }
  });

  it('points each link off the page over https, and each somewhere different', () => {
    for (const { href } of FURTHER_READING) {
      expect(href).toMatch(/^https:\/\/[^/]+\/.+/);
    }
    expect(new Set(FURTHER_READING.map((r) => r.href)).size).toBe(
      FURTHER_READING.length,
    );
  });

  it('opens each in the same tab, so the back button still returns', () => {
    render(<App />);
    for (const a of links()) {
      expect(a).not.toHaveAttribute('target');
      expect(a).not.toHaveAttribute('rel');
    }
  });

  /**
   * The same selector the skip-link suite uses to find the first thing a Tab
   * reaches, read to its end: in document order the reading links are the
   * last things on the page a Tab can land on, and the skip link is still the
   * first.
   */
  it('is the last thing a Tab can reach', () => {
    const { container } = render(<App />);
    const focusable = Array.from(
      container.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(focusable.slice(-FURTHER_READING.length)).toEqual(links());
    expect(focusable[0]).toHaveTextContent(/skip to the chart/i);
  });
});
