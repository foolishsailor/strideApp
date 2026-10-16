import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Button, fit, Icon, type IconName } from '../primitives';
import styles from './SideRail.module.css';

/* The side rail, after TrailMate's own sidebar: the app's mark and name at
   the top with a chevron that folds the rail to its icons (folded, the mark
   unfolds it), an icon and name per page with the current one filled, and a
   group pinned to the bottom. Sized for a finger rather than a mouse:
   TrailMate's 240 / 64 px become 300 / 104 here, and every item is 72px. */

export interface RailItem {
  id: string;
  label: string;
  icon: IconName;
}

export function SideRail({ brand, items, after, bottom = [], active, onSelect, collapsed, onToggle }: {
  /** The app's mark and name, at the top. */
  brand: { mark: ReactNode; name: string };
  items: RailItem[];
  /** After the pages: the runner, as TrailMate lists its user. */
  after?: ReactNode;
  /** Pinned to the bottom. */
  bottom?: RailItem[];
  active: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const item = (it: RailItem) => (
    <RailButton key={it.id} icon={it.icon} label={it.label} collapsed={collapsed}
      selected={it.id === active} onTap={() => onSelect(it.id)} />
  );
  return (
    <nav className={cx(styles.rail, collapsed && styles.collapsed)}>
      <RailBrand {...brand} collapsed={collapsed} onToggle={onToggle} />
      <div className={cx(styles.items, styles.pages)}>
        {items.map(item)}
        {after}
      </div>
      <div className={styles.items}>{bottom.map(item)}</div>
    </nav>
  );
}

/** The mark and name, and the fold: the whole row is one button. Unfolded,
 *  a chevron at its end says it folds; folded, the mark alone is left. */
function RailBrand({ mark, name, collapsed, onToggle }: {
  mark: ReactNode;
  name: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Button size="nav" className={styles.brand} onTap={onToggle}>
      <span className={styles.icon} aria-label={collapsed ? 'Expand' : undefined}>{mark}</span>
      {!collapsed && (
        <>
          <span className={styles.brandName}>{name}</span>
          <span className={styles.fold}><Icon name="chevronLeft" label="Collapse" /></span>
        </>
      )}
    </Button>
  );
}

/** One row of the rail: its icon, and its name unless the rail is folded. */
export function RailButton({ icon, label, collapsed, selected, onTap, children }: {
  icon?: IconName;
  label: string;
  collapsed: boolean;
  selected?: boolean;
  onTap: () => void;
  /** In place of the icon: the runner's initial, say. */
  children?: ReactNode;
}) {
  return (
    <Button size="nav" selected={selected} onTap={onTap}>
      <span className={styles.icon}>{children ?? (icon && <Icon name={icon} label={label} />)}</span>
      {!collapsed && <span className={cx(styles.label, fit(1))}>{label}</span>}
    </Button>
  );
}
