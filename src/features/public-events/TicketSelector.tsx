import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { usePublicEventsApi, useSeatingApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import {
  type AppliedPromo,
  type PublicEvent,
  type PublicTicketType,
  type Quote,
} from '../../api/publicEvents';
import { DateTimeText } from '../../components/DateTimeText';
import { Money } from '../../components/Money';
import { useAuth } from '../../auth/AuthContext';
import { useFormat } from '../../i18n/useFormat';
import { paths } from '../../routes';
import { encodeItems } from '../checkout/selection';
import { isPromoError, useDescribePromoError } from './promoErrors';
import { SeatMapPicker } from './SeatMapPicker';
import type { SeatMap } from '../../api/seating';


type QuoteState = { status: 'idle' } | { status: 'loading'; previous?: Quote } | { status: 'error'; message: string } | { status: 'ready'; quote: Quote };

interface TicketSelectorProps {
  event: PublicEvent;
  /** Opaque token from a campaign link or QR (`?campaign=…`). */
  campaignToken: string | null;
}

/**
 * Ticket steppers, promo code and server-calculated totals (prototype screen 2, SRS 4.6 and 4.14).
 * The client never calculates prices, discounts or fees: every total comes from the quote endpoint.
 */
export function TicketSelector({ event, campaignToken }: TicketSelectorProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const api = usePublicEventsApi();
  const describeError = useDescribeError();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const seatingApi = useSeatingApi();
  const [seatMap, setSeatMap] = useState<SeatMap | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [promo, setPromo] = useState<(AppliedPromo & { fromLink: boolean }) | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [quote, setQuote] = useState<QuoteState>({ status: 'idle' });

  const promoMessage = useDescribePromoError();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Campaign link or QR: apply the code once the server has validated the token (SRS 4.14).
  useEffect(() => {
    if (!campaignToken) return;
    let cancelled = false;
    api.redeemCampaignLink(event.id, campaignToken).then(
      (applied) => !cancelled && setPromo({ ...applied, fromLink: true }),
      (err: unknown) => !cancelled && setPromoError(promoMessage(err)),
    );
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on the token only: re-running on language change would re-apply a removed code.
  }, [api, event.id, campaignToken]);

  // Assigned seating (SRS 4.3.1): seated ticket types are chosen on the map, not with steppers.
  useEffect(() => {
    let cancelled = false;
    seatingApi.getSeatMap(event.id).then(
      (map) => !cancelled && setSeatMap(map.mode === 'assigned' ? map : null),
      () => !cancelled && setSeatMap(null),
    );
    return () => {
      cancelled = true;
    };
  }, [seatingApi, event.id]);
  const seatedTypeIds = new Set(seatMap?.categories.map((c) => c.ticketTypeId).filter(Boolean) as string[]);
  const allSeats = seatMap?.sections.flatMap((s) => s.rows.flatMap((r) => r.seats)) ?? [];
  const seatsOfType = (typeId: string) => selectedSeats.filter((id) => allSeats.find((s) => s.id === id)?.ticketTypeId === typeId);

  const items = [
    ...Object.entries(quantities)
      .filter(([id, quantity]) => quantity > 0 && !seatedTypeIds.has(id))
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })),
    ...[...seatedTypeIds]
      .map((ticketTypeId) => ({ ticketTypeId, seatIds: seatsOfType(ticketTypeId) }))
      .filter((i) => i.seatIds.length > 0)
      .map((i) => ({ ...i, quantity: i.seatIds.length })),
  ];
  const itemsKey = JSON.stringify(items);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  // Re-quote on every change; only the latest answer is shown.
  useEffect(() => {
    if (count === 0) {
      setQuote({ status: 'idle' });
      return;
    }
    let cancelled = false;
    // Keep the last totals on screen (dimmed) while the new ones load, instead of flashing.
    setQuote((q) => ({ status: 'loading', previous: q.status === 'ready' ? q.quote : q.status === 'loading' ? q.previous : undefined }));
    api.quote(event.id, JSON.parse(itemsKey), promo?.code ?? null).then(
      (result) => !cancelled && setQuote({ status: 'ready', quote: result }),
      (err: unknown) => {
        if (cancelled) return;
        if (isPromoError(err)) {
          // The code stopped applying (expired, used up, or not valid for these tickets): drop it and re-quote.
          setPromoError(promoMessage(err));
          setPromo(null);
        } else {
          setQuote({ status: 'error', message: describeError(err) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // `itemsKey` stands in for `items` so a new array with the same content doesn't re-quote.
  }, [api, event.id, itemsKey, promo?.code, count]);

  async function applyCode(e: FormEvent) {
    e.preventDefault();
    const code = codeInput.trim();
    if (!code) {
      setPromoError(t('promo.enterCode'));
      return;
    }
    setChecking(true);
    setPromoError(null);
    try {
      setPromo({ ...(await api.checkPromoCode(event.id, code)), fromLink: false });
      setCodeInput('');
    } catch (err) {
      setPromoError(promoMessage(err));
    } finally {
      setChecking(false);
    }
  }

  const setQuantity = (id: string, quantity: number) => setQuantities((q) => ({ ...q, [id]: quantity }));
  const hasPaid = event.ticketTypes.some((type) => type.kind === 'paid');
  const allFree = event.ticketTypes.every((type) => type.price === 0);

  return (
    <aside className="card event-page__sidebar" aria-labelledby="tickets-heading">
      <h2 id="tickets-heading" className="card__title">
        {t('eventPage.tickets')}
      </h2>
      {hasPaid && event.paidSalesActive && <p className="label-muted public-tickets__note">{t('eventPage.paidActive')}</p>}

      {event.salesSuspended && (
        <p className="notice notice--danger public-tickets__notice" role="note">
          {t('eventPage.salesSuspended')}
        </p>
      )}
      {event.registration === 'not_open' && (
        <p className="notice public-tickets__notice" role="note">
          {t('eventPage.registrationNotOpen')} <DateTimeText value={event.registrationOpensAt} timeZone={event.timeZone} />
        </p>
      )}
      {event.registration === 'closed' && (
        <p className="notice public-tickets__notice" role="note">
          {t('eventPage.registrationClosed')}
        </p>
      )}

      {event.ticketTypes.length === 0 ? (
        <p className="label-muted">{t('eventPage.noTickets')}</p>
      ) : (
        <ul className="event-page__tickets">
          {event.ticketTypes.map((type) => (
            <TicketOption
              key={type.id}
              type={type}
              timeZone={event.timeZone}
              quantity={quantities[type.id] ?? 0}
              onChange={(quantity) => setQuantity(type.id, quantity)}
              seated={seatedTypeIds.has(type.id)}
              seatCount={seatsOfType(type.id).length}
            />
          ))}
        </ul>
      )}

      {seatMap && (
        <SeatMapPicker
          map={seatMap}
          selected={selectedSeats}
          onToggle={(seat) =>
            setSelectedSeats((list) => (list.includes(seat.id) ? list.filter((id) => id !== seat.id) : [...list, seat.id]))
          }
          isBlocked={(seat) => {
            const type = event.ticketTypes.find((tt) => tt.id === seat.ticketTypeId);
            return !type || type.state !== 'on_sale' || seatsOfType(type.id).length >= Math.min(type.maxPerOrder, type.available);
          }}
        />
      )}

      {!allFree && (
        <section className="public-promo" aria-labelledby="promo-heading">
          <h3 id="promo-heading" className="event-page__tickets-title">
            {t('promo.title')}
          </h3>
          {promo ? (
            <div className="notice public-promo__applied" role="status">
              <strong>
                {t('promo.applied', {
                  code: promo.code,
                  discount:
                    promo.discountType === 'percent'
                      ? t('campaigns.card.percentOff', { value: promo.discountValue })
                      : t('campaigns.card.fixedOff', { value: format.kzt(promo.discountValue) }),
                })}
              </strong>
              {promo.fromLink && t('promo.fromLink')}
              <button
                type="button"
                className="btn btn--small public-promo__remove"
                onClick={() => {
                  setPromo(null);
                  setPromoError(null);
                }}
              >
                {t('promo.remove')}
              </button>
            </div>
          ) : (
            <form className="public-promo__form" onSubmit={applyCode} noValidate>
              <label className="sr-only" htmlFor="promo-code">
                {t('promo.label')}
              </label>
              <input
                id="promo-code"
                className="input public-promo__input"
                value={codeInput}
                placeholder={t('promo.label')}
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={!!promoError}
                aria-describedby={promoError ? 'promo-error' : undefined}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              />
              <button type="submit" className="btn" disabled={checking}>
                {checking ? t('common.working') : t('promo.apply')}
              </button>
            </form>
          )}
          {promoError && (
            <p id="promo-error" className="field__error" role="alert">
              {promoError}
            </p>
          )}
        </section>
      )}

      <OrderSummary state={quote} />

      <button
        type="button"
        className="btn btn--primary event-page__cta"
        // Only once the server has priced this exact selection.
        disabled={quote.status !== 'ready'}
        aria-describedby={!user && count > 0 ? 'checkout-sign-in' : undefined}
        onClick={() => navigate(paths.checkoutStart(event.id, encodeItems(items), promo?.code ?? null))}
      >
        {count === 0
          ? t('eventPage.selectTickets')
          : t(allFree ? 'eventPage.registerCount' : 'eventPage.checkoutCount', { count })}
      </button>
      {!user && count > 0 && (
        <p id="checkout-sign-in" className="label-muted event-page__cta-note">
          {t('eventPage.signInToContinue')}
        </p>
      )}

      {event.paymentsSimulated && !allFree && (
        <p className="sim-note" role="note">
          {t('eventPage.simulatedPayments')}
        </p>
      )}
    </aside>
  );
}

function TicketOption({
  type,
  timeZone,
  quantity,
  onChange,
  seated = false,
  seatCount = 0,
}: {
  type: PublicTicketType;
  timeZone: string;
  quantity: number;
  onChange: (quantity: number) => void;
  seated?: boolean;
  seatCount?: number;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const max = Math.min(type.maxPerOrder, type.available);
  const titleId = `public-ticket-${type.id}`;
  const selectable = type.state === 'on_sale' && !seated;

  return (
    <li className="panel event-page__ticket" aria-labelledby={titleId}>
      <div className="event-page__ticket-head">
        <strong id={titleId}>{type.name}</strong>
        <strong className="event-page__ticket-price">
          <Money amount={type.price} freeWhenZero />
        </strong>
      </div>
      {type.description && <p className="label-muted">{type.description}</p>}
      <div className="public-ticket__row">
        <p className="label-muted">
          {type.state === 'on_sale' && t('eventPage.left', { count: type.available, formatted: format.number(type.available) })}
          {type.state === 'sold_out' && t('eventPage.soldOut')}
          {type.state === 'ended' && t('eventPage.salesEnded')}
          {type.state === 'unavailable' && t('eventPage.notOnSaleYet')}
          {type.state === 'scheduled' && (
            <>
              {t('eventPage.onSaleFrom')} <DateTimeText value={type.salesStartAt} timeZone={timeZone} />
            </>
          )}
        </p>
        {seated && type.state === 'on_sale' && (
          <span className="label-muted">{t('seatMap.chosenOnMap', { count: seatCount })}</span>
        )}
        {selectable && (
          <div className="stepper" role="group" aria-label={t('eventPage.quantityFor', { name: type.name })}>
            <button
              type="button"
              className="stepper__button"
              onClick={() => onChange(quantity - 1)}
              disabled={quantity === 0}
              aria-label={t('eventPage.removeOne', { name: type.name })}
            >
              −
            </button>
            <span className="stepper__value" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              className="stepper__button"
              onClick={() => onChange(quantity + 1)}
              disabled={quantity >= max}
              aria-label={t('eventPage.addOne', { name: type.name })}
            >
              +
            </button>
          </div>
        )}
      </div>
      {selectable && quantity >= max && quantity > 0 && (
        <p className="label-muted public-ticket__limit">{t('eventPage.maxReached', { max })}</p>
      )}
    </li>
  );
}

function OrderSummary({ state }: { state: QuoteState }) {
  const { t } = useTranslation();
  if (state.status === 'idle') return null;
  if (state.status === 'error') {
    return (
      <p className="field__error public-summary" role="alert">
        {state.message}
      </p>
    );
  }
  const quote = state.status === 'ready' ? state.quote : state.previous;
  if (!quote) {
    return (
      <p className="label-muted public-summary" role="status">
        {t('eventPage.updatingTotal')}
      </p>
    );
  }
  const updating = state.status === 'loading';
  return (
    <dl
      className={`public-summary${updating ? ' public-summary--updating' : ''}`}
      aria-label={t('eventPage.orderSummary')}
      aria-busy={updating}
    >
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
  );
}
