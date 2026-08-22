import { useEffect, useRef, useState } from 'react';
import { scenarioUrl } from '../lib/scenarioUrl';
import type { PageScenario } from '../lib/scenarioUrl';

/**
 * How long a control has to sit still before the address bar is rewritten, in
 * milliseconds.
 *
 * This one is not a matter of taste. Browsers rate-limit the history API:
 * Safari throws a `SecurityError` on the 101st `replaceState` in 30 seconds,
 * and Chrome and Firefox silently drop the call and log. A range input fires a
 * change per notch, so one unhurried drag of the income slider spends the
 * whole budget — measured at 101 calls in a single sweep of the track and
 * back — and on Safari the throw lands inside an effect, where React has no
 * boundary to catch it and unmounts everything: the reader moves a slider and
 * the screen goes black.
 *
 * A trailing debounce is the fix rather than a cap, because the address is not
 * a log of the drag. It is where the drag *stopped*, which is the one return
 * worth carrying, and a debounce writes exactly that and nothing else — a
 * whole drag is one call. The delay is what bounds the worst case: a reader who
 * stutters, pausing just long enough each time to fire another write, still
 * cannot get past 30_000 / `ADDRESS_SETTLE_MS` calls in the window Safari
 * counts over, and at 400ms that is 75 against a budget of 100.
 *
 * Short enough that it is not a wait. Nobody reads the address bar mid-drag,
 * and the one control that depends on it — Copy link — flushes this itself
 * rather than trusting the timer. See `writeAddress`.
 */
export const ADDRESS_SETTLE_MS = 400;

/**
 * Put a return in the address bar, and never take the document down over it.
 *
 * `replaceState`, not `pushState`: a slider fires a change per notch, so
 * pushing would spend a history entry on every $500 of income and turn Back
 * into a scrub through the drag that got here. Replacing keeps the address
 * shareable and Back still leaves.
 *
 * The whole URL is rebuilt each time rather than the search alone, because
 * `replaceState` takes a URL: passing a bare `?query` would drop the `#step-…`
 * fragment the reader may have arrived on.
 *
 * The `catch` is the seatbelt under `ADDRESS_SETTLE_MS`, not a substitute for
 * it. A browser that refuses to rewrite the address has denied the reader a
 * convenience; it has not made anything on screen untrue, and the failure it
 * throws must not be allowed to reach React, which would unmount the whole
 * document over a URL. There is nothing to tell the reader either — what they
 * are looking at is what they asked for — so it is swallowed rather than
 * reported.
 */
const writeAddress = (scenario: PageScenario): void => {
  try {
    window.history.replaceState(
      window.history.state,
      '',
      scenarioUrl(scenario, window.location),
    );
  } catch {
    /* See above: the address bar is a convenience, and the reading outranks it. */
  }
};

/** What to say about the last copy, or nothing. */
export type CopyState = 'idle' | 'copied' | 'failed';

export interface ScenarioAddress {
  /**
   * Whether this browser will hand a script the clipboard, and so whether the
   * copy button is drawn at all. A copy button that cannot copy is worse than
   * no button, and the sentence beside it — the address bar *is* the link — is
   * the whole feature; the button only saves a reader the trip to the top of
   * the window.
   */
  canCopy: boolean;
  copyState: CopyState;
  copy: () => void;
}

/**
 * Keeps the address bar in step with the return, and copies it on request.
 *
 * Only the write waits on the debounce. The copy status is cleared on the
 * render that changed the return, because "Copied" stops being true of the
 * clipboard the instant a control moves rather than 400ms later.
 *
 * And only a *change* waits. Arrival writes at once, because nothing is being
 * dragged on mount — there is no burst to spread out — and because this is the
 * write that normalises the link the reader came in on, dropping the keys no
 * longer honoured. A link that still names a gain or a tax year is answered by
 * the address bar the moment it is opened rather than four tenths of a second
 * later. See `decodeScenario`.
 */
export const useScenarioAddress = (scenario: PageScenario): ScenarioAddress => {
  /**
   * `navigator.clipboard` is undefined over plain http and in Safari before
   * 13.1 — the DOM types declare it non-optional, which is why the check is
   * written against `typeof` rather than a truthiness test the compiler would
   * consider dead. Read once at mount because the answer cannot change
   * mid-session, and because the tests mount many copies under many browsers.
   */
  const [canCopy] = useState(
    () => typeof navigator.clipboard?.writeText === 'function',
  );
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const {
    filingStatus,
    ssBenefit,
    ordinaryIncome,
    isSenior,
    spouseIsSenior,
    muniInterest,
  } = scenario;

  const written = useRef(false);
  useEffect(() => {
    const current = {
      filingStatus,
      ssBenefit,
      ordinaryIncome,
      isSenior,
      spouseIsSenior,
      muniInterest,
    };
    let timer: number | undefined;
    if (written.current) {
      timer = window.setTimeout(() => writeAddress(current), ADDRESS_SETTLE_MS);
    } else {
      written.current = true;
      writeAddress(current);
    }
    /* The return just changed, so whatever is on the clipboard is a different
       return from the one on screen and "Copied" has stopped being true of
       it. Same reasoning as the link note's Dismiss: a message about an
       arrival cannot be kept current, so it goes when the return moves. */
    setCopyState('idle');
    return () => window.clearTimeout(timer);
  }, [
    filingStatus,
    ssBenefit,
    ordinaryIncome,
    isSenior,
    spouseIsSenior,
    muniInterest,
  ]);

  const copy = (): void => {
    /* Flush the address before reading it. The write above is debounced by
       `ADDRESS_SETTLE_MS`, and a reader who moves a slider and reaches
       straight for this button would otherwise be handed the return they just
       left — silently, since the two links differ only in a query string
       nobody proofreads. Writing it here is what keeps "the button copies
       what is in the address bar" true at every instant rather than merely
       400ms after the last one. */
    writeAddress({
      filingStatus,
      ssBenefit,
      ordinaryIncome,
      isSenior,
      spouseIsSenior,
      muniInterest,
    });
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('failed'));
  };

  return { canCopy, copyState, copy };
};
