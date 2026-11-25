import './orders.css';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useOrdersApi } from '../../api/ApiContext';
import { DateTimeText } from '../../components/DateTimeText';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { Money } from '../../components/Money';
import { paths } from '../../routes';
import { EventSummaryLine, OrderStatusBadge } from './parts';
import { useLoad } from './useLoad';

/** `/account/orders`: every order the signed-in user placed, newest first. */
export function MyOrdersPage() {
  const { t } = useTranslation();
  const api = useOrdersApi();
  const { state, reload } = useLoad(() => api.listMyOrders(), [api]);

  return (
    <div>
      <h1 className="section-title">{t('orders.title')}</h1>
      <p className="section-subtitle">
        <Link to={paths.myTickets}>{t('orders.seeTickets')}</Link>
      </p>
      {state.status === 'loading' && <LoadingState label={t('orders.loading')} />}
      {state.status === 'error' && <ErrorState title={t('orders.loadError')} message={state.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.length === 0 && (
        <EmptyState
          title={t('orders.emptyTitle')}
          description={t('orders.emptyBody')}
          action={
            <Link to={paths.home} className="btn btn--primary">
              {t('discover.browse')}
            </Link>
          }
        />
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="order-list">
          {state.data.map((order) => (
            <li key={order.id} className="card order-row" aria-labelledby={`order-${order.id}`}>
              <div className="order-row__main">
                <EventSummaryLine event={order.event} as="h2" />
                <OrderStatusBadge status={order.status} />
              </div>
              <dl className="order-row__facts">
                <div>
                  <dt className="label-muted">{t('checkout.success.orderNumber')}</dt>
                  <dd id={`order-${order.id}`} className="order__number">
                    {order.number}
                  </dd>
                </div>
                <div>
                  <dt className="label-muted">{t('orders.placed')}</dt>
                  <dd>
                    <DateTimeText value={order.createdAt} timeZone={order.event.timeZone} />
                  </dd>
                </div>
                <div>
                  <dt className="label-muted">{t('checkout.success.tickets')}</dt>
                  <dd>{order.ticketCount}</dd>
                </div>
                <div>
                  <dt className="label-muted">{t('eventPage.total')}</dt>
                  <dd>
                    <Money amount={order.total} freeWhenZero />
                    {order.paymentsSimulated && order.total > 0 && (
                      <span className="order-row__sim"> {t('orders.simulatedTag')}</span>
                    )}
                  </dd>
                </div>
              </dl>
              <Link
                to={paths.order(order.id)}
                className="btn btn--small"
                aria-label={t('orders.viewLabel', { number: order.number })}
              >
                {t('orders.view')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
