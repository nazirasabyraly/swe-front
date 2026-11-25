import './orders.css';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useOrdersApi } from '../../api/ApiContext';
import type { Ticket } from '../../api/orders';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { TicketListItem } from './parts';
import { useLoad } from './useLoad';

/** `/account/tickets`: upcoming tickets first (soonest first), then past ones (latest first). */
export function MyTicketsPage({ now = () => new Date() }: { now?: () => Date }) {
  const { t } = useTranslation();
  const api = useOrdersApi();
  const { state, reload } = useLoad(() => api.listMyTickets(), [api]);

  if (state.status === 'loading') return <LoadingState label={t('tickets.loading')} />;
  if (state.status === 'error') return <ErrorState title={t('tickets.loadError')} message={state.message} onRetry={reload} />;

  const at = now();
  const upcoming = state.data
    .filter((ticket) => ticket.event.endsAt >= at)
    .sort((a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime());
  const past = state.data
    .filter((ticket) => ticket.event.endsAt < at)
    .sort((a, b) => b.event.startsAt.getTime() - a.event.startsAt.getTime());

  return (
    <div>
      <h1 className="section-title">{t('tickets.title')}</h1>
      <p className="section-subtitle">
        <Link to={paths.myOrders}>{t('tickets.seeOrders')}</Link>
      </p>
      {state.data.length === 0 ? (
        <EmptyState
          title={t('tickets.emptyTitle')}
          description={t('tickets.emptyBody')}
          action={
            <Link to={paths.home} className="btn btn--primary">
              {t('discover.browse')}
            </Link>
          }
        />
      ) : (
        <>
          <TicketGroup id="upcoming" title={t('tickets.upcoming')} empty={t('tickets.noUpcoming')} tickets={upcoming} />
          <TicketGroup id="past" title={t('tickets.past')} empty={t('tickets.noPast')} tickets={past} />
        </>
      )}
    </div>
  );
}

function TicketGroup({ id, title, empty, tickets }: { id: string; title: string; empty: string; tickets: Ticket[] }) {
  return (
    <section className="ticket-group" aria-labelledby={`tickets-${id}`}>
      <h2 id={`tickets-${id}`} className="ticket-group__title">
        {title}
      </h2>
      {tickets.length === 0 ? (
        <p className="label-muted">{empty}</p>
      ) : (
        <ul className="ticket-list ticket-list--grid">
          {tickets.map((ticket) => (
            <TicketListItem key={ticket.id} ticket={ticket} showEvent />
          ))}
        </ul>
      )}
    </section>
  );
}
