import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useEventsApi, useOrganizerApi } from '../../api/ApiContext';
import type { OrganizerEvent } from '../../api/events';
import type { AnalyticsFilter } from '../../api/organizer';
import { BarChart } from '../../components/BarChart';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { Money } from '../../components/Money';
import { useFormat } from '../../i18n/useFormat';
import { paths } from '../../routes';
import { useLoad } from '../orders/useLoad';
import { EventAdminLayout } from './EventAdminLayout';

/** `/organizer/events/:id`: actions plus the basic analytics dashboard (SRS 4.6, 4.15, 4.16). */
export function EventOverviewPage({ now }: { now?: () => Date }) {
  return <EventAdminLayout now={now}>{(event) => <Overview event={event} now={now ?? (() => new Date())} />}</EventAdminLayout>;
}

function Overview({ event, now }: { event: OrganizerEvent; now: () => Date }) {
  const { t } = useTranslation();
  const eventsApi = useEventsApi();
  const navigate = useNavigate();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const cancelled = event.status === 'cancelled';

  async function duplicate() {
    setDuplicating(true);
    try {
      const copy = await eventsApi.duplicateEvent(event.id);
      navigate(paths.organizerEventSetup(copy.id, 'details'));
    } finally {
      setDuplicating(false);
    }
  }

  async function cancelEvent() {
    if (!reason.trim()) throw new Error(t('eventAdmin.cancel.reasonRequired'));
    await eventsApi.cancelEvent(event.id, reason.trim());
    navigate(paths.organizerEvents, { state: { flash: t('eventAdmin.cancel.done', { title: event.title }) } });
  }

  return (
    <>
      <div className="event-admin__actions">
        {!cancelled && (
          <Link to={paths.organizerEditEvent(event.id)} className="btn">
            {t('myEvents.edit')}
          </Link>
        )}
        <button type="button" className="btn" onClick={duplicate} disabled={duplicating}>
          {duplicating ? t('common.working') : t('eventAdmin.duplicate')}
        </button>
        {!cancelled && (
          <button type="button" className="btn btn--danger" onClick={() => setCancelOpen(true)}>
            {t('eventAdmin.cancel.button')}
          </button>
        )}
      </div>

      <Analytics event={event} now={now} />

      <ConfirmDialog
        open={cancelOpen}
        title={t('eventAdmin.cancel.title', { title: event.title })}
        confirmLabel={t('eventAdmin.cancel.confirm')}
        tone="danger"
        onConfirm={cancelEvent}
        onClose={() => setCancelOpen(false)}
      >
        <p>{t('eventAdmin.cancel.body')}</p>
        <label className="field__label" htmlFor="cancel-reason">
          {t('eventAdmin.cancel.reason')}
        </label>
        <textarea id="cancel-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </>
  );
}

function Analytics({ event, now }: { event: OrganizerEvent; now: () => Date }) {
  const { t } = useTranslation();
  const api = useOrganizerApi();
  const format = useFormat();
  const [filter, setFilter] = useState<{ from: string; to: string; ticketTypeId: string }>({ from: '', to: '', ticketTypeId: '' });
  const query: AnalyticsFilter = {
    from: filter.from ? new Date(`${filter.from}T00:00:00Z`) : undefined,
    to: filter.to ? new Date(`${filter.to}T23:59:59Z`) : undefined,
    ticketTypeId: filter.ticketTypeId || undefined,
  };
  const { state, reload } = useLoad(() => api.getAnalytics(event.id, query), [api, event.id, filter.from, filter.to, filter.ticketTypeId]);

  if (state.status === 'loading') return <LoadingState label={t('analytics.loading')} />;
  if (state.status === 'error') return <ErrorState title={t('analytics.loadError')} message={state.message} onRetry={reload} />;
  const a = state.data;
  const started = event.startsAt <= now();

  return (
    <section aria-labelledby="analytics-heading">
      <h2 id="analytics-heading" className="ticket-group__title">
        {t('analytics.title')}
      </h2>

      <div className="analytics-filters">
        <div className="field">
          <label className="field__label" htmlFor="an-from">{t('analytics.from')}</label>
          <input id="an-from" type="date" className="input" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="an-to">{t('analytics.to')}</label>
          <input id="an-to" type="date" className="input" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="an-type">{t('analytics.ticketType')}</label>
          <select id="an-type" className="input" value={filter.ticketTypeId} onChange={(e) => setFilter({ ...filter, ticketTypeId: e.target.value })}>
            <option value="">{t('analytics.allTypes')}</option>
            {a.ticketTypes.map((tt) => (
              <option key={tt.id} value={tt.id}>{tt.name}</option>
            ))}
          </select>
        </div>
      </div>

      <dl className="kpi-grid" aria-label={t('analytics.kpiLabel')}>
        <div className="kpi">
          <dt>{t('analytics.sold')}</dt>
          <dd>
            {format.number(a.sold)}
            <span className="kpi__sub">{t('analytics.ofCapacity', { capacity: format.number(a.capacity), percent: a.percentSold })}</span>
          </dd>
        </div>
        <div className="kpi">
          <dt>{t('analytics.remaining')}</dt>
          <dd>{format.number(a.remaining)}</dd>
        </div>
        <div className="kpi">
          <dt>{t('analytics.gross')}</dt>
          <dd><Money amount={a.gross} /></dd>
        </div>
        <div className="kpi">
          <dt>{t('analytics.discounts')}</dt>
          <dd><Money amount={a.discounts} /></dd>
        </div>
        <div className="kpi">
          <dt>{t('analytics.refunds')}</dt>
          <dd><Money amount={a.refunds} /></dd>
        </div>
        <div className="kpi">
          <dt>{t('analytics.net')}</dt>
          <dd><Money amount={a.net} /></dd>
        </div>
        <div className="kpi">
          <dt>{t('analytics.fees')}</dt>
          <dd><Money amount={a.fees} /><span className="kpi__sub">{t('analytics.feesNote')}</span></dd>
        </div>
        <div className="kpi">
          <dt>{t('analytics.payout')}</dt>
          <dd><Money amount={a.estimatedPayout} /></dd>
        </div>
      </dl>
      {a.paymentsSimulated && <p className="sim-note analytics__sim">{t('analytics.simulated')}</p>}

      <div className="analytics-grid">
        <div className="card">
          <BarChart
            title={t('analytics.salesOverTime')}
            data={a.salesOverTime.map((p) => ({ key: p.date, label: format.shortDate(new Date(`${p.date}T12:00:00Z`), event.timeZone), value: p.tickets }))}
            formatValue={(v) => t('analytics.ticketsValue', { count: v, formatted: format.number(v) })}
            labelHeader={t('analytics.date')}
            valueHeader={t('analytics.soldShort')}
          />
        </div>
        <div className="card">
          <BarChart
            title={t('analytics.byType')}
            orientation="horizontal"
            data={a.byTicketType.map((b) => ({ key: b.ticketTypeId, label: b.name, value: b.sold }))}
            formatValue={(v) => format.number(v)}
            labelHeader={t('analytics.ticketType')}
            valueHeader={t('analytics.soldShort')}
          />
        </div>

        <div className="card">
          <h3 className="bar-chart__title">{t('analytics.campaigns')}</h3>
          {a.campaigns.length === 0 ? (
            <p className="label-muted">{t('analytics.noCampaigns')}</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{t('analytics.code')}</th>
                    <th scope="col" className="num">{t('analytics.redemptions')}</th>
                    <th scope="col" className="num">{t('analytics.soldShort')}</th>
                    <th scope="col" className="num">{t('analytics.net')}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.campaigns.map((c) => (
                    <tr key={c.code}>
                      <th scope="row">{c.code}<span className="kpi__sub">{c.name}</span></th>
                      <td className="num">{format.number(c.redemptions)}</td>
                      <td className="num">{format.number(c.tickets)}</td>
                      <td className="num"><Money amount={c.net} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="bar-chart__title">{t('analytics.attendance')}</h3>
          {started ? (
            <dl className="kpi-grid">
              <div className="kpi"><dt>{t('analytics.checkedIn')}</dt><dd>{format.number(a.attendance.checkedIn)}</dd></div>
              <div className="kpi"><dt>{t('analytics.absent')}</dt><dd>{format.number(a.attendance.absent)}</dd></div>
              <div className="kpi"><dt>{t('analytics.checkInRate')}</dt><dd>{a.attendance.percent}%</dd></div>
            </dl>
          ) : (
            <p className="label-muted">{t('analytics.attendanceLater')}</p>
          )}
        </div>
      </div>
    </section>
  );
}
