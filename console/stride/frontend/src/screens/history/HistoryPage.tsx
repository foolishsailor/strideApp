import { Clock, EmptyState } from '../../components/molecules';
import { Page, PageContent, PageHeader } from '../../components/layout';

/** History: the runner's runs from TrailMate, newest first. The list itself
 *  arrives with the TrailMate side (a device endpoint and permission). */
export function HistoryPage() {
  return (
    <Page>
      <PageHeader title="History" subtitle="Your runs from TrailMate, newest first" aside={<Clock />} />
      <PageContent>
        <EmptyState title="No runs to show yet">
          Your runs will be listed here once TrailMate lets the treadmill read them.
        </EmptyState>
      </PageContent>
    </Page>
  );
}
