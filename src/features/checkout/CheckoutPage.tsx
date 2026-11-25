import '../create-event/create-event.css';
import '../public-events/public-events.css';
import './checkout.css';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useCheckoutApi } from '../../api/ApiContext';
import {
  CHECKOUT_ERRORS,
  ticketSlots,
  type OrderSummary,
  type Reservation,
  type SimulatedOutcome,
} from '../../api/checkout';
import { useDescribeError } from '../../api/errors';
import { ApiError } from '../../api/http';
import { useAuth } from '../../auth/AuthContext';
import { DateTimeRangeText } from '../../components/DateTimeText';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { Money } from '../../components/Money';
import { useFormat } from '../../i18n/useFormat';
import { paths } from '../../routes';
import type { OrderLocationState } from '../orders/OrderPage';
import { HoldTimer } from './HoldTimer';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; reservation: Reservation };

const NAME_MAX = 100;

/** `/checkout/:reservationId`: attendee details, refund policy, (simulated) payment. SRS 4.4 and 4.6. */
export function CheckoutPage() {
  const { t } = useTranslation();
  const { reservationId = '' } = useParams();
  const api = useCheckoutApi();
  const describeError = useDescribeError();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    api.getReservation(reservationId).then(
      (reservation) => !cancelled && setState({ status: 'ready', reservation }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: describeError(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, reservationId, describeError]);
  useEffect(load, [load]);

  if (state.status === 'loading') return <LoadingState label={t('checkout.loading')} />;
  if (state.status === 'error') {
    return <ErrorState title={t('checkout.loadError')} message={state.message} onRetry={load} />;
  }

  const { reservation } = state;
  if (reservation.status !== 'held') return <CheckoutClosed reservation={reservation} />;
  return (
    <CheckoutForm
      reservation={reservation}
      onExpired={load}
      onCompleted={(placed) => {
        const orderState: OrderLocationState = { justPlaced: true };
        navigate(paths.order(placed.id), { replace: true, state: orderState });
      }}
    />
  );
}

function EventLine({ reservation }: { reservation: Reservation }) {
  const { event } = reservation;
  return (
    <p className="section-subtitle">
      <strong>{event.title}</strong>
      <br />
      <DateTimeRangeText start={event.startsAt} end={event.endsAt} timeZone={event.timeZone} showZone /> ·{' '}
      {event.venue.name}, {event.venue.city}
    </p>
  );
}

interface CheckoutFormProps {
  reservation: Reservation;
  onExpired: () => void;
  onCompleted: (order: OrderSummary) => void;
}

function CheckoutForm({ reservation, onExpired, onCompleted }: CheckoutFormProps) {
  const { t } = useTranslation();
  const api = useCheckoutApi();
  const navigate = useNavigate();
  const describeError = useDescribeError();
  const { user } = useAuth();
  const format = useFormat();
  const slots = ticketSlots(reservation.quote);
  const [names, setNames] = useState<string[]>(() => slots.map((_, i) => (i === 0 ? (user?.name ?? '') : '')));
  const [nameErrors, setNameErrors] = useState<(string | null)[]>([]);
  const [refundAccepted, setRefundAccepted] = useState(false);
  const [refundError, setRefundError] = useState(false);
  const [outcome, setOutcome] = useState<SimulatedOutcome>('success');
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);

  const { quote, event } = reservation;
  const paid = quote.total > 0;
  const needsRefundConsent = Boolean(event.refundPolicy);
  const simulated = reservation.paymentsSimulated;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const nextNameErrors = names.map((name) =>
      !name.trim() ? t('checkout.nameRequired') : name.trim().length > NAME_MAX ? t('checkout.nameTooLong', { max: NAME_MAX }) : null,
    );
    const refundMissing = needsRefundConsent && !refundAccepted;
    setNameErrors(nextNameErrors);
    setRefundError(refundMissing);
    const firstBad = nextNameErrors.findIndex(Boolean);
    if (firstBad >= 0) {
      document.getElementById(`attendee-${firstBad}`)?.focus();
      return;
    }
    if (refundMissing) {
      document.getElementById('refund-consent')?.focus();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const attendees = slots.map((slot, i) => ({ ticketTypeId: slot.ticketTypeId, name: names[i].trim() }));
      onCompleted(await api.confirmReservation(reservation.id, attendees, simulated ? outcome : undefined));
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.code === CHECKOUT_ERRORS.expired) {
        onExpired();
        return;
      }
      const declined = err instanceof ApiError && err.code === CHECKOUT_ERRORS.declined;
      setError({
        title: declined ? t('checkout.declinedTitle') : t('checkout.confirmError'),
        body: declined ? t('checkout.declinedBody') : describeError(err),
      });
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      await api.cancelReservation(reservation.id);
    } finally {
      // Even if the call failed, the hold expires on its own; never trap the attendee here.
      navigate(paths.publicEvent(event.id));
    }
  }

  return (
    <div>
      <Link to={paths.publicEvent(event.id)} className="back-link">
        {t('checkout.back')}
      </Link>
      <h1 className="section-title">{paid ? t('checkout.title') : t('checkout.titleFree')}</h1>
      <EventLine reservation={reservation} />

      <div className="checkout__layout">
        <form className="checkout__main" onSubmit={submit} noValidate aria-label={t('checkout.formLabel')}>
          <section className="card" aria-labelledby="attendees-heading">
            <h2 id="attendees-heading" className="card__title">
              {t('checkout.attendees')}
            </h2>
            <p className="label-muted checkout__hint">{t('checkout.attendeesHint')}</p>
            <div className="checkout__attendees">
              {slots.map((slot, i) => (
                <div key={`${slot.ticketTypeId}-${slot.index}`} className="field">
                  <label className="field__label" htmlFor={`attendee-${i}`}>
                    {t('checkout.attendeeLabel', { n: i + 1, ticket: slot.name })}
                  </label>
                  <input
                    id={`attendee-${i}`}
                    className="input"
                    autoComplete={i === 0 ? 'name' : 'off'}
                    value={names[i]}
                    aria-invalid={Boolean(nameErrors[i])}
                    aria-describedby={nameErrors[i] ? `attendee-${i}-error` : undefined}
                    onChange={(e) => setNames((all) => all.map((n, j) => (j === i ? e.target.value : n)))}
                  />
                  {nameErrors[i] && (
                    <span id={`attendee-${i}-error`} className="field__error">
                      {nameErrors[i]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="card" aria-labelledby="contact-heading">
            <h2 id="contact-heading" className="card__title">
              {t('checkout.contact')}
            </h2>
            <p className="checkout__contact">
              {user?.name}
              <br />
              <span className="label-muted">{user?.email}</span>
            </p>
            <p className="label-muted checkout__hint">{t('checkout.contactHint')}</p>
          </section>

          {needsRefundConsent && (
            <section className="card" aria-labelledby="refund-heading">
              <h2 id="refund-heading" className="card__title">
                {t('eventPage.refundPolicy')}
              </h2>
              <p className="event-page__paragraph">{event.refundPolicy}</p>
              <label className="checkbox-row">
                <input
                  id="refund-consent"
                  type="checkbox"
                  checked={refundAccepted}
                  aria-invalid={refundError}
                  aria-describedby={refundError ? 'refund-consent-error' : undefined}
                  onChange={(e) => setRefundAccepted(e.target.checked)}
                />
                {t('checkout.refundConsent')}
              </label>
              {refundError && (
                <p id="refund-consent-error" className="field__error">
                  {t('checkout.refundRequired')}
                </p>
              )}
            </section>
          )}

          {paid && (
            <section className="card" aria-labelledby="payment-heading">
              <div className="checkout__payment-head">
                <h2 id="payment-heading" className="card__title">
                  {t('checkout.payment')}
                </h2>
                {simulated && <span className="sim-label">{t('paidSales.simulationLabel')}</span>}
              </div>
              {simulated ? (
                <>
                  <p className="sim-note checkout__sim">{t('checkout.simulatedPayment')}</p>
                  <fieldset className="fieldset-reset field">
                    <legend className="field__label">{t('checkout.simulatedOutcome')}</legend>
                    <div className="chip-group">
                      {(['success', 'declined'] as const).map((value) => (
                        <label key={value} className="chip">
                          <input
                            type="radio"
                            name="simulated-outcome"
                            checked={outcome === value}
                            onChange={() => setOutcome(value)}
                          />
                          {t(`checkout.outcome.${value}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </>
              ) : (
                <p className="label-muted">{t('checkout.providerRedirect')}</p>
              )}
            </section>
          )}

          {error && (
            <div className="notice notice--danger" role="alert">
              <strong>{error.title}</strong>
              {error.body}
            </div>
          )}

          <div className="form-actions checkout__actions">
            <button type="button" className="btn" onClick={cancel} disabled={cancelling || submitting}>
              {t('checkout.cancel')}
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting || cancelling}>
              {submitting
                ? t('common.working')
                : paid
                  ? t(simulated ? 'checkout.paySimulated' : 'checkout.pay', { total: format.kzt(quote.total) })
                  : t('checkout.completeRegistration')}
            </button>
          </div>
        </form>

        <OrderSidebar reservation={reservation} onExpire={onExpired} />
      </div>
    </div>
  );
}

function OrderSidebar({ reservation, onExpire }: { reservation: Reservation; onExpire: () => void }) {
  const { t } = useTranslation();
  const { quote } = reservation;
  return (
    <aside className="card checkout__summary" aria-labelledby="order-heading">
      <h2 id="order-heading" className="card__title">
        {t('checkout.yourOrder')}
      </h2>
      <HoldTimer expiresAt={reservation.expiresAt} onExpire={onExpire} />
      <ul className="checkout__lines">
        {quote.lines.map((line) => (
          <li key={line.ticketTypeId}>
            <span>{t('checkout.line', { name: line.name, quantity: line.quantity })}</span>
            <Money amount={line.lineTotal} freeWhenZero />
          </li>
        ))}
      </ul>
      {reservation.seats && reservation.seats.length > 0 && (
        <ul className="checkout__lines" aria-label={t('seatMap.yourSeats')}>
          {reservation.seats.map((s) => (
            <li key={s.seatId}>{t('tickets.seatValue', s)}</li>
          ))}
        </ul>
      )}
      <dl className="public-summary" aria-label={t('eventPage.orderSummary')}>
        <div>
          <dt>{t('eventPage.subtotal')}</dt>
          <dd>
            <Money amount={quote.subtotal} />
          </dd>
        </div>
        {quote.discount > 0 && (
          <div>
            <dt>{t('eventPage.discount', { code: quote.promoCode })}</dt>
            <dd>
              −<Money amount={quote.discount} />
            </dd>
          </div>
        )}
        <div>
          <dt>{t('eventPage.fee')}</dt>
          <dd>
            <Money amount={quote.fee} />
          </dd>
        </div>
        <div className="public-summary__total">
          <dt>{t('eventPage.total')}</dt>
          <dd>
            <Money amount={quote.total} />
          </dd>
        </div>
      </dl>
      {reservation.paymentsSimulated && quote.total > 0 && <p className="sim-note">{t('eventPage.simulatedPayments')}</p>}
    </aside>
  );
}

function CheckoutClosed({ reservation }: { reservation: Reservation }) {
  const { t } = useTranslation();
  const key = reservation.status === 'expired' ? 'expired' : reservation.status === 'cancelled' ? 'cancelled' : 'completed';
  return (
    <section className="card empty-state">
      <h1 className="card__title">{t(`checkout.closed.${key}Title`)}</h1>
      <p className="label-muted" role="status">
        {t(`checkout.closed.${key}Body`)}
      </p>
      <Link to={paths.publicEvent(reservation.event.id)} className="btn btn--primary">
        {key === 'completed' ? t('checkout.backToEvent') : t('checkout.chooseAgain')}
      </Link>
    </section>
  );
}
