import { useTranslation } from 'react-i18next';
import type { OrganizerEvent } from '../../api/events';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { PaidSalesChecklist } from './PaidSalesChecklist';
import { usePaidSales } from './usePaidSales';

/** Loads an event's activation status and shows the checklist; used by wizard step 3 and the standalone page. */
export function PaidSalesPanel({ event }: { event: OrganizerEvent }) {
  const { t } = useTranslation();
  const { state, reload, set } = usePaidSales(event.id);

  if (state.status === 'loading') return <LoadingState label={t('paidSales.loading')} />;
  if (state.status === 'error') {
    return <ErrorState title={t('paidSales.loadError')} message={state.message} onRetry={reload} />;
  }
  return <PaidSalesChecklist paidSales={state.paidSales} timeZone={event.timeZone} onChange={set} />;
}
