import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarDatum[];
  /** Visible heading text names the series; no legend for a single series. */
  title: string;
  formatValue: (value: number) => string;
  /** Vertical columns (time) or horizontal bars (categories). */
  orientation?: 'vertical' | 'horizontal';
  /** Column header for the label in the table view. */
  labelHeader: string;
  valueHeader: string;
}

const HEIGHT = 180;
const BAR_GAP = 2; // surface gap between adjacent bars

/**
 * Hand-drawn SVG bar chart (no chart library). One series, one hue, thin bars with rounded data
 * ends, recessive axes, a hover/focus tooltip per bar and a table view for screen readers and
 * anyone who prefers numbers.
 */
export function BarChart({ data, title, formatValue, orientation = 'vertical', labelHeader, valueHeader }: BarChartProps) {
  const { t } = useTranslation();
  const id = useId();
  const [active, setActive] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.value));
  const activeDatum = data.find((d) => d.key === active);

  return (
    <figure className="bar-chart" aria-labelledby={`${id}-title`}>
      <div className="bar-chart__head">
        <figcaption id={`${id}-title`} className="bar-chart__title">
          {title}
        </figcaption>
        <button type="button" className="btn btn--small" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? t('charts.showChart') : t('charts.showTable')}
        </button>
      </div>

      {data.length === 0 ? (
        <p className="label-muted">{t('charts.noData')}</p>
      ) : asTable ? (
        <table className="bar-chart__table">
          <thead>
            <tr>
              <th scope="col">{labelHeader}</th>
              <th scope="col">{valueHeader}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.label}</th>
                <td>{formatValue(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : orientation === 'horizontal' ? (
        <ul className="hbar" aria-label={title}>
          {data.map((d) => (
            <li key={d.key} className="hbar__row">
              <span className="hbar__label">{d.label}</span>
              <span className="hbar__track" aria-hidden="true">
                <span className="hbar__fill" style={{ width: `${(d.value / max) * 100}%` }} />
              </span>
              <span className="hbar__value">{formatValue(d.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="vbar">
          <svg
            className="vbar__svg"
            viewBox={`0 0 ${data.length * 12} ${HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={t('charts.summary', {
              title,
              count: data.length,
              max: formatValue(max),
              total: formatValue(data.reduce((s, d) => s + d.value, 0)),
            })}
          >
            <line x1="0" x2={data.length * 12} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} className="vbar__axis" />
            {data.map((d, i) => {
              const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * (HEIGHT - 8));
              const w = 12 - BAR_GAP;
              const x = i * 12 + BAR_GAP / 2;
              const y = HEIGHT - h;
              const r = Math.min(4, w / 2, h);
              // Rounded top (data end), square base on the axis.
              const path = `M${x},${HEIGHT} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${HEIGHT} Z`;
              return (
                <g key={d.key} onMouseEnter={() => setActive(d.key)} onMouseLeave={() => setActive(null)}>
                  {/* Hit target taller than the mark */}
                  <rect x={i * 12} y={0} width={12} height={HEIGHT} fill="transparent" />
                  <path d={path} className={`vbar__bar${active === d.key ? ' vbar__bar--active' : ''}`} />
                </g>
              );
            })}
          </svg>
          <div className="vbar__axis-labels" aria-hidden="true">
            <span>{data[0].label}</span>
            {data.length > 1 && <span>{data[data.length - 1].label}</span>}
          </div>
          <p className="vbar__tooltip" aria-live="polite">
            {activeDatum ? `${activeDatum.label}: ${formatValue(activeDatum.value)}` : ' '}
          </p>
        </div>
      )}
    </figure>
  );
}
