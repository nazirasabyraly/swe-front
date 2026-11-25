import '../public-events/public-events.css';
import './orders.css';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';
import { useOrdersApi } from '../../api/ApiContext';
import { DateTimeText } from '../../components/DateTimeText';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { Money } from '../../components/Money';
import { useAuth } from '../../auth/AuthContext';
import { paths } from '../../routes';
import { EventSummaryLine, OrderStatusBadge, TicketListItem } from './parts';
import { AddToCalendar } from '../../components/AddToCalendar';
import { GetHelpLink } from '../support/parts';
import { useLoad } from './useLoad';

/** Set by checkout when it navigates here, to show the confirmation header. */
export interface OrderLocationState {
  justPlaced?: boolean;
}

/** `/orders/:id`: confirmation right after checkout, and the order detail later (SRS 4.7). */
export function OrderPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const api = useOrdersApi();
  const { user } = useAuth();
  const justPlaced = Boolean((useLocation().state as OrderLocationState | null)?.justPlaced);
  const { state, reload } = useLoad(() => api.getMyOrder(id), [api, id]);

  if (state.status === 'loading') return <LoadingState label={t('orders.loadingOne')} />;
  if (state.status === 'error') return <ErrorState title={t('orders.loadErrorOne')} message={state.message} onRetry={reload} />;

  const order = state.data;
  const paid = order.total > 0;
  const title = justPlaced
    ? t(paid ? 'checkout.success.paidTitle' : 'checkout.success.freeTitle')
    : t('orders.orderTitle', { number: order.number });

  return (
    <div className="order-page">
      <Link to={paths.myOrders} className="back-link">
        {t('orders.back')}
      </Link>

      <section className={`card order${justPlaced ? ' order--new' : ''}`} aria-labelledby="order-title">
        {justPlaced && (
          <p className="checkout-success__mark" aria-hidden="true">
            ✓
          </p>
        )}
        <h1 id="order-title" className="section-title">
          {title}
        </h1>
        <EventSummaryLine event={order.event} />

        <dl className="order__facts">
          <div>
            <dt className="label-muted">{t('checkout.success.orderNumber')}</dt>
            <dd className="order__number">{order.number}</dd>
          </div>
          <div>
            <dt className="label-muted">{t('orders.statusLabel')}</dt>
            <dd>
              <OrderStatusBadge status={order.status} />
            </dd>
          </div>
          <div>
            <dt className="label-muted">{t('orders.placed')}</dt>
            <dd>
              <DateTimeText value={order.createdAt} timeZone={order.event.timeZone} />
            </dd>
          </div>
          <div>
            <dt className="label-muted">{paid ? t('checkout.success.paid') : t('eventPage.total')}</dt>
            <dd>
              <Money amount={order.total} freeWhenZero />
            </dd>
          </div>
        </dl>

        {order.paymentsSimulated && paid && <p className="sim-note">{t('checkout.success.simulated')}</p>}
        {justPlaced && <p>{t('checkout.success.emailed', { email: user?.email ?? '' })}</p>}

        {paid && (
          <dl className="public-summary order__totals" aria-label={t('eventPage.orderSummary')}>
            {order.lines.map((line) => (
              <div key={line.ticketTypeId}>
                <dt>{t('checkout.line', { name: line.name, quantity: line.quantity })}</dt>
                <dd>
                  <Money amount={line.lineTotal} />
                </dd>
              </div>
            ))}
            {order.discount > 0 && (
              <div>
                <dt>{t('eventPage.discount', { code: order.promoCode })}</dt>
                <dd>
                  −<Money amount={order.discount} />
                </dd>
              </div>
            )}
            <div>
              <dt>{t('eventPage.fee')}</dt>
              <dd>
                <Money amount={order.fee} />
              </dd>
            </div>
            <div className="public-summary__total">
              <dt>{t('eventPage.total')}</dt>
              <dd>
                <Money amount={order.total} />
              </dd>
            </div>
            {order.paymentMethod && (
              <div>
                <dt>{t('orders.paymentMethod')}</dt>
                <dd>{order.paymentMethod}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section className="card" aria-labelledby="order-tickets">
        <div className="order__calendar no-print">
          <h2 className="event-page__tickets-title">{t('calendar.title')}</h2>
          <AddToCalendar
            event={{ ...order.event, url: `${window.location.origin}${paths.publicEvent(order.event.id)}` }}
            cancelled={order.status === 'refunded' || order.status === 'cancelled'}
          />
        </div>
        <div className="order__help no-print">
          <GetHelpLink event={order.event.id} order={order.id} about={`${order.number} · ${order.event.title}`} className="btn btn--small" />
        </div>
        <h2 id="order-tickets" className="card__title">
          {t('orders.tickets', { count: order.tickets.length })}
        </h2>
        <ul className="ticket-list">
          {order.tickets.map((ticket) => (
            <TicketListItem key={ticket.id} ticket={ticket} />
          ))}
        </ul>
      </section>
    </div>
  );
}
