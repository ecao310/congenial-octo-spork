import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * The two ways out of an open panel that is not a dialog: Escape, and a click
 * on anything else.
 *
 * `container` has to wrap the trigger *and* the panel, so pressing the trigger
 * while it is open counts as a click inside — otherwise the outside-click
 * listener would shut the panel a moment before the trigger's own handler
 * reopened it, and the control would never close. Escape puts focus back on
 * the trigger, because a reader who dismisses a panel with the keyboard has
 * nowhere else to be.
 *
 * Nothing traps focus. What this is written for is a group of checkboxes
 * rather than a dialog, and Tab out of one is a legitimate way to leave it.
 */
export const useDismissable = (
  open: boolean,
  dismiss: () => void,
  container: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLElement | null>,
): void => {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent): void => {
      if (!container.current?.contains(e.target as Node)) dismiss();
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      dismiss();
      trigger.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, dismiss, container, trigger]);
};
