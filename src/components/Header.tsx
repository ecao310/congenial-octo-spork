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
        Because of how Social Security is taxed, your marginal tax rate is often
        very different than what you might expect. Use this tool to calculate
        marginal tax rates based on your social security income.
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
