import { useTranslation } from 'react-i18next';
import type { PaidSalesState } from '../../api/paidSales';
import type { TicketType } from '../../api/ticketTypes';
import { Money } from '../../components/Money';
import { StatusBadge, type StatusTone } from '../../components/StatusBadge';
import { useFormat } from '../../i18n/useFormat';
import { ticketTypeStatus, type TicketTypeStatus } from './model';

const TONES: Record<TicketTypeStatus, StatusTone> = {
  onSale: 'success',
  scheduled: 'info',
  ended: 'neutral',
  soldOut: 'danger',
  hidden: 'neutral',
  awaitingActivation: 'warning',
  salesSuspended: 'danger',
};

interface TicketTypeRowProps {
  type: TicketType;
  paidSales: PaidSalesState | 'unknown';
  timeZone: string;
  now: Date;
  pending: boolean;
  error?: string;
  onEdit: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
}

/** One ticket type, laid out like the rows on prototype screen 3, plus SRS 4.3 counters. */
export function TicketTypeRow({ type, paidSales, timeZone, now, pending, error, onEdit, onToggleHidden, onDelete }: TicketTypeRowProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const status = ticketTypeStatus(type, now, paidSales);
  const canDelete = type.counts.sold + type.counts.reserved === 0;
  const titleId = `ticket-type-${type.id}`;
  const counters = ['available', 'reserved', 'sold', 'refunded', 'checkedIn'] as const;

  return (
    <li className={`panel ticket-row${type.hidden ? ' ticket-row--hidden' : ''}`} aria-labelledby={titleId}>
      <div className="ticket-row__main">
        <div className="ticket-row__name">
          <h3 id={titleId} className="ticket-row__title">
            {type.name}
          </h3>
          <p className="label-muted">
            {t('ticketTypes.row.sales', {
              start: format.shortDate(type.salesStartAt, timeZone),
              end: format.shortDate(type.salesEndAt, timeZone),
            })}
          </p>
          {type.description && <p className="ticket-row__description">{type.description}</p>}
        </div>
        <div className="ticket-row__fact">
          <span className="label-muted">{t('ticketTypes.row.price')}</span>
          <strong>
            <Money amount={type.price} freeWhenZero />
          </strong>
        </div>
        <div className="ticket-row__fact">
          <span className="label-muted">{t('ticketTypes.row.quantity')}</span>
          <strong>{format.number(type.quantity)}</strong>
        </div>
        <div className="ticket-row__status">
          <StatusBadge tone={TONES[status]}>{t(`ticketTypes.status.${status}`)}</StatusBadge>
        </div>
      </div>

      <dl className="ticket-row__counters" aria-label={t('ticketTypes.row.countersLabel', { name: type.name })}>
        {counters.map((key) => (
          <div key={key}>
            <dt>{t(`ticketTypes.counters.${key}`)}</dt>
            <dd>{format.number(type.counts[key])}</dd>
          </div>
        ))}
      </dl>

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <div className="ticket-row__actions">
        <button
          type="button"
          className="btn btn--small"
          onClick={onEdit}
          disabled={pending}
          aria-label={t('ticketTypes.actions.editLabel', { name: type.name })}
        >
          {t('ticketTypes.actions.edit')}
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={onToggleHidden}
          disabled={pending}
          aria-label={t(type.hidden ? 'ticketTypes.actions.showLabel' : 'ticketTypes.actions.hideLabel', {
            name: type.name,
          })}
        >
          {type.hidden ? t('ticketTypes.actions.show') : t('ticketTypes.actions.hide')}
        </button>
        {canDelete && (
          <button
            type="button"
            className="btn btn--small"
            onClick={onDelete}
            disabled={pending}
            aria-label={t('ticketTypes.actions.deleteLabel', { name: type.name })}
          >
            {t('ticketTypes.actions.delete')}
          </button>
        )}
      </div>
    </li>
  );
}
