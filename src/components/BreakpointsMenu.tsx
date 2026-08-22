import { useRef, useState } from 'react';
import { PTC_CLIFF_PERCENT } from '../lib/tax';
import { useDismissable } from '../hooks/useDismissable';

export interface BreakpointsMenuProps {
  /**
   * How many lines the plot is actually drawing — a count of marks on the
   * chart, not of ticked boxes. The two part company whenever a switch is on
   * and its threshold falls off the axis, and the count is the only thing that
   * says so now that the panel is two checkboxes and nothing else: a ticked box
   * with no number beside the button's name is a threshold this axis does not
   * reach.
   */
  linesShown: number;
  showIrmaaLines: boolean;
  onShowIrmaaLines: (show: boolean) => void;
  /**
   * Whether the poverty-line switch is offered at all: nobody on Medicare can
   * claim the credit, and a year without a 400% ceiling has no line to draw.
   */
  offerSubsidyLine: boolean;
  showSubsidyLine: boolean;
  onShowSubsidyLine: (show: boolean) => void;
}

/**
 * The chart's own settings, and the only control here that changes what is
 * drawn rather than what is priced.
 *
 * It rides in the figure's top-right corner rather than on a row above it: a
 * row of its own cost the chart the better part of an inch of screen to hold
 * one small button. Not down among the sliders, because those all move the
 * return and this one does not touch it.
 *
 * Whether the panel is open is nobody else's business, so that state lives
 * here with the two refs and the dismissal it needs. Which lines are *on*
 * belongs to the step, because the plot beside this reads them.
 */
export const BreakpointsMenu: React.FC<BreakpointsMenuProps> = ({
  linesShown,
  showIrmaaLines,
  onShowIrmaaLines,
  offerSubsidyLine,
  showSubsidyLine,
  onShowSubsidyLine,
}) => {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useDismissable(open, () => setOpen(false), container, trigger);

  return (
    <div className="chart-lines" ref={container}>
      <button
        type="button"
        ref={trigger}
        className="chart-lines-button"
        aria-expanded={open}
        aria-controls="torpedo-lines"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Breakpoints
        {linesShown > 0 ? ` (${linesShown})` : ''}
      </button>
      {open && (
        <div className="chart-lines-panel" id="torpedo-lines">
          <fieldset className="chart-lines-group">
            {/* Two switches and their legend, and nothing else. What each
                threshold costs this return is in the close, what a cliff is is
                in the disclosure below, and both were being said a third time
                in a panel that floats over the chart the reader opened it to
                look at. */}
            <legend>Health insurance breakpoints</legend>
            <label className="checkbox-option chart-lines-option">
              <input
                type="checkbox"
                checked={showIrmaaLines}
                onChange={(e) => onShowIrmaaLines(e.target.checked)}
              />
              <span
                className="chart-key-swatch chart-lines-swatch"
                aria-hidden="true"
              />
              <span>Medicare IRMAA cliffs</span>
            </label>
            {offerSubsidyLine && (
              <label className="checkbox-option chart-lines-option">
                <input
                  type="checkbox"
                  checked={showSubsidyLine}
                  onChange={(e) => onShowSubsidyLine(e.target.checked)}
                />
                <span
                  className="chart-key-swatch chart-lines-swatch chart-key-swatch-subsidy"
                  aria-hidden="true"
                />
                <span>{PTC_CLIFF_PERCENT * 100}% poverty-line cliff</span>
              </label>
            )}
          </fieldset>
        </div>
      )}
    </div>
  );
};
