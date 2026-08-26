export interface HeaderProps {
  /**
   * What the link asked for and could not have, if anything. Dismissible
   * because it describes the arrival rather than the return: it stops being
   * true of what is on screen the moment the reader moves a control, and there
   * is no honest way to keep it current.
   */
  linkNotes: string[];
  onDismissNotes: () => void;
}

/**
 * The masthead: the title and the deck, and what the link that opened the
 * page did.
 *
 * The note is in here rather than loose above the steps because it is about
 * the arrival rather than about the return — the same thing the title and the
 * deck are — and because content outside every landmark is content a reader
 * jumping by landmark never lands on.
 */
export const Header: React.FC<HeaderProps> = ({ linkNotes, onDismissNotes }) => (
  <header className="masthead">
    <div className="masthead-body">
      <h1>Social Security and Marginal Tax Rates</h1>
      <p className="subtitle">
        You may think of marginal tax rates as monotonically increasing, starting
        at 10% after standard deduction and climbing to 35%. However, because of
        how Social Security is taxed, your marginal tax rate can actually decrease
        as income increases and in some cases exceed 40% before reaching the
        highest bracket. Use this tool to calculate marginal tax rates based on
        your social security benefit.
      </p>
    </div>

    {linkNotes.length > 0 && (
      <div className="link-note" role="status">
        <p>
          <strong>This link asked for something this page could not show.</strong>{' '}
          Everything else in it came through as sent.
        </p>
        <ul>
          {linkNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <button type="button" onClick={onDismissNotes}>
          Dismiss
        </button>
      </div>
    )}
  </header>
);
