import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Button, fit, Icon } from '../primitives';
import styles from './Page.module.css';

/* A page is a header, its content, and a footer, stacked to fill whatever
   holds it: the whole panel, or the shell's main area beside the rail. Every
   page on the console is built from these, so they line up with each other
   and keep the same distance from the bezel. */

/** Fills its parent: header at the top, footer at the bottom, content between. */
export function Page({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx(styles.page, className)}>{children}</div>;
}

/** The app bar: back in the top-left corner when there is somewhere to go
 *  back to, the page's title and an optional line under it, and something on
 *  the right (the clock, or the page's own actions). */
export function PageHeader({ title, subtitle, aside, onBack }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <header className={styles.header}>
      {onBack && (
        <Button size="nav" className={styles.back} onTap={onBack}>
          <Icon name="back" label="Back" />
        </Button>
      )}
      <div className={styles.titles}>
        {title && <div className={cx(styles.title, fit(1))}>{title}</div>}
        {subtitle && <div className={cx(styles.subtitle, fit(1))}>{subtitle}</div>}
      </div>
      {aside && <div className={styles.aside}>{aside}</div>}
    </header>
  );
}

/**
 * The body, between header and footer.
 *  - `centred`: content in the middle, as the welcome steps are.
 *  - `fill`: content takes the whole box and sizes itself (the Workouts week).
 *  - `scroll`: a column that scrolls, finger-dragged (History).
 */
export function PageContent({ layout = 'centred', className, children, onScrollEnd }: {
  layout?: 'centred' | 'fill' | 'scroll';
  className?: string;
  children: ReactNode;
  /** For `scroll`: called as the end comes into view, for loading more. */
  onScrollEnd?: () => void;
}) {
  return (
    <div className={cx(styles.content, styles[layout], className)}>
      {children}
      {layout === 'scroll' && onScrollEnd && <ScrollEnd onReach={onScrollEnd} />}
    </div>
  );
}

/** Actions along the bottom: start (BACK), centre (a note), end (BEGIN). */
export function PageFooter({ start, centre, end }: { start?: ReactNode; centre?: ReactNode; end?: ReactNode }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.start}>{start}</div>
      <div className={styles.centre}>{centre}</div>
      <div className={styles.end}>{end}</div>
    </footer>
  );
}

/* Watches the bottom of a scrolling column: an endless list asks for its next
   page here, a screen's height before the end comes into view, so it is
   usually there before the finger gets to it. */
function ScrollEnd({ onReach }: { onReach: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onReach);
  latest.current = onReach;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) latest.current();
    }, { root: el.parentElement, rootMargin: '0px 0px 100% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={styles.scrollEnd} aria-hidden="true" />;
}
