import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganizerApi } from '../../api/ApiContext';
import type { OrganizerEvent } from '../../api/events';
import type { OrganizerOrder } from '../../api/organizer';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DateTimeText } from '../../components/DateTimeText';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { Money } from '../../components/Money';
import { OrderStatusBadge, TicketStatusBadge } from '../orders/parts';
import { useLoad } from '../orders/useLoad';
import { EventAdminLayout } from './EventAdminLayout';

/** `/organizer/events/:id/orders`: orders with full refunds, and the attendee list (SRS 4.4, 4.9). */
export function EventOrdersPage() {
  return <EventAdminLayout>{(event) => <Orders event={event} />}</EventAdminLayout>;
}

function Orders({ event }: { event: OrganizerEvent }) {
  const { t } = useTranslation();
  const api = useOrganizerApi();
  const { state, reload } = useLoad(() => api.listEventOrders(event.id), [api, event.id]);
  const [view, setView] = useState<'orders' | 'attendees'>('orders');
  const [query, setQuery] = useState('');
  const [refunding, setRefunding] = useState<OrganizerOrder | null>(null);
  const [reason, setReason] = useState('');
  const [replaced, setReplaced] = useState<Record<string, OrganizerOrder>>({});

  if (state.status === 'loading') return <LoadingState label={t('eventOrders.loading')} />;
  if (state.status === 'error') return <ErrorState title={t('eventOrders.loadError')} message={state.message} onRetry={reload} />;

  const orders = state.data.map((o) => replaced[o.id] ?? o);
  const needle = query.trim().toLowerCase();
  const matches = (o: OrganizerOrder) =>
    !needle ||
    [o.number, o.buyer.name, o.buyer.email, ...o.tickets.flatMap((tk) => [tk.id, tk.attendeeName])].some((v) => v.toLowerCase().includes(needle));
  const shown = orders.filter(matches);
  const attendees = shown.flatMap((o) => o.tickets.map((tk) => ({ ...tk, order: o })));

  async function refund() {
    if (!refunding) return;
    if (!reason.trim()) throw new Error(t('eventOrders.reasonRequired'));
    const updated = await api.refundOrder(event.id, refunding.id, reason.trim());
    setReplaced((r) => ({ ...r, [updated.id]: updated }));
    setReason('');
    setRefunding(null);
  }

  return (
    <section aria-labelledby="orders-heading">
      <h2 id="orders-heading" className="sr-only">{t('eventAdmin.nav.orders')}</h2>
      <div className="analytics-filters">
        <fieldset className="fieldset-reset">
          <legend className="sr-only">{t('eventOrders.view')}</legend>
          <div className="chip-group">
            {(['orders', 'attendees'] as const).map((v) => (
              <label key={v} className="chip">
                <input type="radio" name="orders-view" checked={view === v} onChange={() => setView(v)} />
                {t(`eventOrders.${v}`, { count: v === 'orders' ? shown.length : attendees.length })}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label className="field__label" htmlFor="orders-search">{t('eventOrders.search')}</label>
          <input id="orders-search" type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState headingLevel={3} title={t('eventOrders.emptyTitle')} description={t('eventOrders.emptyBody')} />
      ) : view === 'orders' ? (
        <div className="card table-scroll">
          <table className="data-table">
            <caption className="sr-only">{t('eventOrders.ordersCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('checkout.success.orderNumber')}</th>
                <th scope="col">{t('eventOrders.buyer')}</th>
                <th scope="col">{t('orders.placed')}</th>
                <th scope="col" className="num">{t('checkout.success.tickets')}</th>
                <th scope="col" className="num">{t('eventPage.total')}</th>
                <th scope="col">{t('orders.statusLabel')}</th>
                <th scope="col"><span className="sr-only">{t('eventOrders.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id}>
                  <th scope="row" className="order__number">{o.number}</th>
                  <td>{o.buyer.name}<span className="kpi__sub">{o.buyer.email}</span></td>
                  <td><DateTimeText value={o.createdAt} timeZone={event.timeZone} /></td>
                  <td className="num">{o.ticketCount}</td>
                  <td className="num">
                    <Money amount={o.total} freeWhenZero />
                    {o.paymentsSimulated && o.total > 0 && <span className="kpi__sub">{t('orders.simulatedTag')}</span>}
                  </td>
                  <td><OrderStatusBadge status={o.status} /></td>
                  <td>
                    {o.refundable && (
                      <button type="button" className="btn btn--small" onClick={() => setRefunding(o)} aria-label={t(o.total > 0 ? 'eventOrders.refundLabel' : 'eventOrders.cancelLabel', { number: o.number })}>
                        {o.total > 0 ? t('eventOrders.refund') : t('eventOrders.cancelRegistration')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card table-scroll">
          <table className="data-table">
            <caption className="sr-only">{t('eventOrders.attendeesCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('tickets.attendee')}</th>
                <th scope="col">{t('tickets.type')}</th>
                <th scope="col">{t('tickets.ticketId')}</th>
                <th scope="col">{t('checkout.success.orderNumber')}</th>
                <th scope="col">{t('orders.statusLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {attendees.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.attendeeName}</th>
                  <td>{a.ticketTypeName}{a.seat && <span className="kpi__sub">{t('tickets.seatValue', a.seat)}</span>}</td>
                  <td className="ticket__id">{a.id}</td>
                  <td className="order__number">{a.order.number}</td>
                  <td><TicketStatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={refunding !== null}
        title={refunding && refunding.total > 0 ? t('eventOrders.refundTitle', { number: refunding.number }) : t('eventOrders.cancelTitle', { number: refunding?.number ?? '' })}
        confirmLabel={refunding && refunding.total > 0 ? t('eventOrders.refundConfirm') : t('eventOrders.cancelConfirm')}
        tone="danger"
        onConfirm={refund}
        onClose={() => setRefunding(null)}
      >
        {refunding && refunding.total > 0 ? (
          <p>
            {t('eventOrders.refundBody', { name: refunding.buyer.name })} <Money amount={refunding.total} />
            {refunding.paymentsSimulated && ` ${t('eventOrders.refundSimulated')}`}
          </p>
        ) : (
          <p>{t('eventOrders.cancelBody')}</p>
        )}
        <label className="field__label" htmlFor="refund-reason">{t('eventOrders.reason')}</label>
        <textarea id="refund-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </section>
  );
}
