import { Fragment } from 'react';
import { listSeparator } from '../lib/returnProse';

/**
 * An English list as marks on the page, for the clauses that carry a bolded
 * figure. Its flat twin, for anything read aloud, is `joinProse` — both take
 * their commas from `listSeparator`, so a listener and a reader are never told
 * about two different returns.
 */
export const ProseList: React.FC<{
  items: { key: string; node: React.ReactNode }[];
}> = ({ items }) => (
  <>
    {items.map(({ key, node }, i) => (
      <Fragment key={key}>
        {listSeparator(i, items.length)}
        {node}
      </Fragment>
    ))}
  </>
);
