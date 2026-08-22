import { useEffect, useState } from 'react';

/**
 * How long a control has to sit still before the live region takes its new
 * reading, in milliseconds.
 *
 * Long enough that a drag across the whole axis is one announcement rather
 * than sixty — a range input fires a change per notch, and every one of them
 * would otherwise queue a sentence a polite region reads out in full before
 * it looks at the next. Short enough that a reader who moves one notch and
 * stops is not left wondering whether anything happened.
 */
export const READING_SETTLE_MS = 700;

/**
 * A reading that lags its input: it takes a new value only once that value
 * has held still for `delay`, and what is on screen never waits on it.
 *
 * This is the whole of the debounce the live region needs. It is not a
 * throttle — a throttle would read out the middle of a drag, which is a
 * figure the reader was passing through rather than one they chose — and it
 * deliberately drops everything before the last value rather than queueing
 * it.
 *
 * Mounting takes the reading as it stands rather than scheduling it: content
 * already inside a live region on load is not announced, so there is nothing
 * to wait for and nothing to interrupt the reader's own walk down the column
 * with.
 */
export const useSettledReading = (
  reading: string,
  delay: number = READING_SETTLE_MS,
): string => {
  const [settled, setSettled] = useState(reading);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(reading), delay);
    return () => window.clearTimeout(timer);
  }, [reading, delay]);
  return settled;
};
