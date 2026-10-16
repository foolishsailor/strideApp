import { Button } from '../primitives';
import styles from './SortBar.module.css';

export interface SortOption<K extends string> {
  key: K;
  label: string;
}

/** Sort a list: each option once, the current one lit with its direction.
 *  Pressing the current one turns it round; pressing another sorts by that,
 *  ascending. */
export function SortBar<K extends string>({ options, sort, onSort }: {
  options: readonly SortOption<K>[];
  sort: { key: K; asc: boolean };
  onSort: (sort: { key: K; asc: boolean }) => void;
}) {
  return (
    <div className={styles.bar}>
      <span className={styles.caption}>Sort by</span>
      {options.map((o) => {
        const on = o.key === sort.key;
        return (
          <Button key={o.key} size="chip" selected={on} className={styles.option}
            onTap={() => onSort({ key: o.key, asc: on ? !sort.asc : true })}>
            {o.label}{on && <span className={styles.dir}>{sort.asc ? '↑' : '↓'}</span>}
          </Button>
        );
      })}
    </div>
  );
}
