import { useTranslation } from 'react-i18next';
import type { SeatMap, SeatMapSeat, SeatStatus } from '../../api/seating';
import { useFormat } from '../../i18n/useFormat';

/** Every state has its own colour AND symbol, so it never relies on colour alone (SRS 4.3.1, WCAG 1.4.1). */
const SYMBOL: Record<SeatStatus | 'selected' | 'accessible', string> = {
  available: '',
  selected: '✓',
  held: '◷',
  sold: '×',
  unavailable: '–',
  accessible: '♿',
};

interface Props {
  map: SeatMap;
  selected: string[];
  onToggle: (seat: SeatMapSeat) => void;
  /** Seats that can't be added any more (per-order limit reached for their ticket type). */
  isBlocked: (seat: SeatMapSeat) => boolean;
}

/** Interactive seat map for assigned-seating events. */
export function SeatMapPicker({ map, selected, onToggle, isBlocked }: Props) {
  const { t } = useTranslation();
  const format = useFormat();

  const describe = (section: string, row: string, seat: SeatMapSeat, isSelected: boolean) =>
    [
      t('seatMap.seatName', { section, row, seat: seat.number }),
      seat.price !== null ? format.kzt(seat.price) : null,
      seat.accessible ? t('seatMap.accessible') : null,
      isSelected ? t('seatMap.status.selected') : t(`seatMap.status.${seat.status}`),
    ]
      .filter(Boolean)
      .join(', ');

  return (
    <section className="seat-map" aria-labelledby="seat-map-heading">
      <h3 id="seat-map-heading" className="event-page__tickets-title">
        {t('seatMap.title')}
      </h3>
      <p className="seat-map__stage" aria-hidden="true">
        {t('seatMap.stage')}
      </p>
      {map.sections.map((section) => (
        <div key={section.id} className="seat-map__section" role="group" aria-label={section.name}>
          <p className="seat-map__section-name">{section.name}</p>
          {section.rows.map((row) => (
            <div key={row.label} className="seat-map__row" role="group" aria-label={t('seatMap.row', { row: row.label })}>
              <span className="seat-map__row-label" aria-hidden="true">
                {row.label}
              </span>
              {row.seats.map((seat) => {
                const isSelected = selected.includes(seat.id);
                const disabled = !isSelected && (seat.status !== 'available' || isBlocked(seat));
                const state = isSelected ? 'selected' : seat.status;
                return (
                  <button
                    key={seat.id}
                    type="button"
                    className={`seat seat--${state}${seat.accessible ? ' seat--accessible' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={describe(section.name, row.label, seat, isSelected)}
                    disabled={disabled}
                    onClick={() => onToggle(seat)}
                  >
                    <span aria-hidden="true">{SYMBOL[state] || (seat.accessible ? SYMBOL.accessible : '')}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ))}
      <ul className="seat-map__legend" aria-label={t('seatMap.legend')}>
        {(['available', 'selected', 'held', 'sold', 'unavailable'] as const).map((s) => (
          <li key={s}>
            <span className={`seat seat--${s}`} aria-hidden="true">{SYMBOL[s]}</span>
            {t(`seatMap.status.${s}`)}
          </li>
        ))}
        <li>
          <span className="seat seat--available seat--accessible" aria-hidden="true">{SYMBOL.accessible}</span>
          {t('seatMap.accessible')}
        </li>
      </ul>
    </section>
  );
}
