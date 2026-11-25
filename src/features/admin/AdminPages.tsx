import '../event-admin/event-admin.css';
import '../public-events/public-events.css';
import '../orders/orders.css';
import '../support/support.css';
import './admin.css';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { useAdminApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import type { AdminEvent, AdminPayment, PaymentKind, PaymentStatus, PlatformSettings, SearchResults } from '../../api/admin';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DateTimeText } from '../../components/DateTimeText';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { FormField } from '../../components/FormField';
import { Money } from '../../components/Money';
import { StatusBadge, type StatusTone } from '../../components/StatusBadge';
import { useFormat } from '../../i18n/useFormat';
import { downloadCsv } from '../../lib/csv';
import { paths } from '../../routes';
import { useLoad } from '../orders/useLoad';

// ---------------------------------------------------------------- layout

function AdminLayout({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const links: [string, string][] = [
    ['/admin', t('admin.nav.search')],
    ['/admin/events', t('admin.nav.events')],
    ['/admin/reports', t('admin.nav.reports')],
    ['/admin/payments', t('admin.nav.payments')],
    ['/admin/activations', t('admin.nav.activations')],
    ['/admin/promos', t('admin.nav.promos')],
    [paths.support, t('admin.nav.support')],
    ['/admin/settings', t('admin.nav.settings')],
  ];
  return (
    <div>
      <p className="eyebrow">{t('admin.portal')}</p>
      <h1 className="section-title">{title}</h1>
      <nav className="event-admin-nav" aria-label={t('admin.nav.label')}>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end>
            {label}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}

function Loaded<T>({ state, reload, children }: { state: ReturnType<typeof useLoad<T>>['state']; reload: () => void; children: (data: T) => ReactNode }) {
  const { t } = useTranslation();
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState title={t('admin.loadError')} message={state.message} onRetry={reload} />;
  return <>{children(state.data)}</>;
}

const SimTag = () => {
  const { t } = useTranslation();
  return <span className="order-row__sim"> {t('orders.simulatedTag')}</span>;
};

/** Suspend/reinstate with a required reason, recorded in the audit log. */
function useSuspendDialog() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<{ title: string; run: (reason: string) => Promise<unknown> } | null>(null);
  const [reason, setReason] = useState('');
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.title ?? ''}
      confirmLabel={t('admin.confirm')}
      tone="danger"
      onConfirm={async () => {
        if (!reason.trim()) throw new Error(t('admin.reasonRequired'));
        await pending!.run(reason.trim());
        setReason('');
        setPending(null);
      }}
      onClose={() => setPending(null)}
    >
      <label className="field__label" htmlFor="admin-reason">{t('admin.reason')}</label>
      <textarea id="admin-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
    </ConfirmDialog>
  );
  return { open: (title: string, run: (reason: string) => Promise<unknown>) => setPending({ title, run }), dialog };
}

const PAY_TONES: Record<PaymentStatus, StatusTone> = { succeeded: 'success', failed: 'danger', disputed: 'warning' };

function PaymentsTable({ payments }: { payments: AdminPayment[] }) {
  const { t } = useTranslation();
  return (
    <div className="card table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{t('admin.payments.reference')}</th>
            <th scope="col">{t('admin.payments.kind')}</th>
            <th scope="col">{t('support.event')}</th>
            <th scope="col">{t('support.order')}</th>
            <th scope="col">{t('orders.placed')}</th>
            <th scope="col" className="num">{t('admin.payments.amount')}</th>
            <th scope="col">{t('orders.statusLabel')}</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <th scope="row" className="ticket__id">{p.reference}</th>
              <td>{t(`admin.payments.kinds.${p.kind}`)}</td>
              <td>{p.eventTitle}</td>
              <td className="order__number">{p.orderNumber ?? '—'}</td>
              <td><DateTimeText value={p.createdAt} /></td>
              <td className="num"><Money amount={p.kind === 'refund' ? -p.amount : p.amount} />{p.simulated && <SimTag />}</td>
              <td><StatusBadge tone={PAY_TONES[p.status]}>{t(`admin.payments.statuses.${p.status}`)}</StatusBadge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- search (home)

export function AdminSearchPage() {
  const { t } = useTranslation();
  const api = useAdminApi();
  const describeError = useDescribeError();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const suspend = useSuspendDialog();

  async function search(e?: FormEvent) {
    e?.preventDefault();
    setSearching(true);
    setError(null);
    try {
      setResults(await api.search(query));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSearching(false);
    }
  }

  return (
    <AdminLayout title={t('admin.searchTitle')}>
      <form role="search" className="discover__search admin-search" onSubmit={search}>
        <label className="sr-only" htmlFor="admin-q">{t('admin.searchLabel')}</label>
        <input id="admin-q" type="search" className="input" value={query} placeholder={t('admin.searchPlaceholder')} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" className="btn btn--primary" disabled={searching}>{t('discover.search')}</button>
      </form>
      {error && <p className="field__error" role="alert">{error}</p>}
      {results && (
        <div className="admin-results">
          <section aria-labelledby="res-users">
            <h2 id="res-users" className="ticket-group__title">{t('admin.results.users', { count: results.users.length })}</h2>
            {results.users.length > 0 && (
              <div className="card table-scroll">
                <table className="data-table">
                  <tbody>
                    {results.users.map((u) => (
                      <tr key={u.id}>
                        <th scope="row">{u.name}<span className="kpi__sub">{u.email}</span></th>
                        <td>{u.roles.map((r) => t(`account.role.${r}`)).join(', ')}</td>
                        <td><StatusBadge tone={u.status === 'active' ? 'success' : 'danger'}>{t(`admin.userStatus.${u.status}`)}</StatusBadge></td>
                        <td>
                          <button
                            type="button"
                            className="btn btn--small"
                            onClick={() =>
                              suspend.open(
                                t(u.status === 'active' ? 'admin.suspendUserTitle' : 'admin.reinstateUserTitle', { name: u.name }),
                                async (reason) => {
                                  await api.setUserSuspended(u.id, u.status === 'active', reason);
                                  await search();
                                },
                              )
                            }
                          >
                            {u.status === 'active' ? t('admin.suspend') : t('admin.reinstate')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section aria-labelledby="res-events">
            <h2 id="res-events" className="ticket-group__title">{t('admin.results.events', { count: results.events.length })}</h2>
            {results.events.map((e) => (
              <p key={e.id}><Link to={paths.organizerEvent(e.id)}>{e.title}</Link> · {e.organizerName}{e.suspended && ` · ${t('admin.events.suspended')}`}</p>
            ))}
          </section>
          <section aria-labelledby="res-orders">
            <h2 id="res-orders" className="ticket-group__title">{t('admin.results.orders', { count: results.orders.length })}</h2>
            {results.orders.map((o) => (
              <p key={o.id}>
                <span className="order__number">{o.number}</span> · {o.eventTitle} · {o.buyerEmail} · <Money amount={o.total} freeWhenZero />
                {o.paymentsSimulated && o.total > 0 && <SimTag />}
              </p>
            ))}
          </section>
          <section aria-labelledby="res-payments">
            <h2 id="res-payments" className="ticket-group__title">{t('admin.results.payments', { count: results.payments.length })}</h2>
            {results.payments.length > 0 && <PaymentsTable payments={results.payments} />}
          </section>
        </div>
      )}
      {suspend.dialog}
    </AdminLayout>
  );
}

// ---------------------------------------------------------------- events

export function AdminEventsPage() {
  const { t } = useTranslation();
  const api = useAdminApi();
  const { state, reload } = useLoad(() => api.listEvents(), [api]);
  const suspend = useSuspendDialog();

  const act = (e: AdminEvent, what: 'event' | 'paid') => {
    const suspending = what === 'event' ? !e.suspended : e.paidSales !== 'suspended';
    const key = what === 'event' ? (suspending ? 'admin.events.suspendTitle' : 'admin.events.reinstateTitle') : suspending ? 'admin.events.suspendPaidTitle' : 'admin.events.reinstatePaidTitle';
    suspend.open(t(key, { title: e.title }), async (reason) => {
      await (what === 'event' ? api.setEventSuspended(e.id, suspending, reason) : api.setPaidSalesSuspended(e.id, suspending, reason));
      reload();
    });
  };

  return (
    <AdminLayout title={t('admin.nav.events')}>
      <Loaded state={state} reload={reload}>
        {(events) => (
          <div className="card table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('support.event')}</th>
                  <th scope="col">{t('orders.statusLabel')}</th>
                  <th scope="col">{t('admin.events.paidSales')}</th>
                  <th scope="col" className="num">{t('admin.events.reports')}</th>
                  <th scope="col"><span className="sr-only">{t('eventOrders.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <th scope="row">{e.title}<span className="kpi__sub">{e.organizerName} · <DateTimeText value={e.startsAt} /></span></th>
                    <td>
                      {e.suspended ? <StatusBadge tone="danger">{t('admin.events.suspended')}</StatusBadge> : t(`myEvents.${e.status}`)}
                    </td>
                    <td>{t(`paidSales.state.${e.paidSales}`)}</td>
                    <td className="num">{e.openReports}</td>
                    <td className="admin-actions">
                      <button type="button" className="btn btn--small" onClick={() => act(e, 'event')} aria-label={t(e.suspended ? 'admin.events.reinstateLabel' : 'admin.events.suspendLabel', { title: e.title })}>
                        {e.suspended ? t('admin.reinstate') : t('admin.events.suspendSales')}
                      </button>
                      {(e.paidSales === 'active' || e.paidSales === 'suspended') && (
                        <button type="button" className="btn btn--small" onClick={() => act(e, 'paid')} aria-label={t(e.paidSales === 'suspended' ? 'admin.events.reinstatePaidLabel' : 'admin.events.suspendPaidLabel', { title: e.title })}>
                          {e.paidSales === 'suspended' ? t('admin.events.reinstatePaid') : t('admin.events.suspendPaid')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loaded>
      {suspend.dialog}
    </AdminLayout>
  );
}

// ---------------------------------------------------------------- reports

export function AdminReportsPage() {
  const { t } = useTranslation();
  const api = useAdminApi();
  const { state, reload } = useLoad(() => api.listReports(), [api]);
  return (
    <AdminLayout title={t('admin.nav.reports')}>
      <Loaded state={state} reload={reload}>
        {(reports) =>
          reports.length === 0 ? (
            <EmptyState headingLevel={2} title={t('admin.reports.empty')} />
          ) : (
            <ul className="support-cases">
              {reports.map((r) => (
                <li key={r.id} className="panel admin-report">
                  <div>
                    <p><strong>{r.event.title}</strong> · {t(`admin.reports.reasons.${r.reason}`)}</p>
                    <p>{r.details}</p>
                    <p className="label-muted">{r.reporter.name} ({r.reporter.email}) · <DateTimeText value={r.createdAt} /></p>
                  </div>
                  {r.status === 'open' ? (
                    <div className="admin-actions">
                      <Link to="/admin/events" className="btn btn--small">{t('admin.reports.review')}</Link>
                      <button type="button" className="btn btn--small" onClick={async () => { await api.resolveReport(r.id, 'actioned'); reload(); }}>{t('admin.reports.markActioned')}</button>
                      <button type="button" className="btn btn--small" onClick={async () => { await api.resolveReport(r.id, 'dismissed'); reload(); }}>{t('admin.reports.dismiss')}</button>
                    </div>
                  ) : (
                    <StatusBadge tone="neutral">{t(`admin.reports.status.${r.status}`)}</StatusBadge>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
    </AdminLayout>
  );
}

// ---------------------------------------------------------------- payments

export function AdminPaymentsPage() {
  const { t } = useTranslation();
  const api = useAdminApi();
  const format = useFormat();
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [kind, setKind] = useState<PaymentKind | ''>('');
  const { state, reload } = useLoad(() => api.listPayments({ status: status || undefined, kind: kind || undefined }), [api, status, kind]);

  function exportCsv(payments: AdminPayment[]) {
    downloadCsv(`biletflow-payments-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['reference', 'kind', 'status', 'amount_kzt', 'order', 'event', 'created_at', 'simulated'],
      ...payments.map((p) => [p.reference, p.kind, p.status, String(p.amount), p.orderNumber ?? '', p.eventTitle, p.createdAt.toISOString(), p.simulated ? 'yes' : 'no']),
    ]);
  }

  return (
    <AdminLayout title={t('admin.nav.payments')}>
      <p className="sim-note admin-sim">{t('admin.payments.simulatedNote')}</p>
      <div className="analytics-filters">
        <div className="field">
          <label className="field__label" htmlFor="pay-status">{t('orders.statusLabel')}</label>
          <select id="pay-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus | '')}>
            <option value="">{t('admin.all')}</option>
            {(['succeeded', 'failed', 'disputed'] as const).map((s) => <option key={s} value={s}>{t(`admin.payments.statuses.${s}`)}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="pay-kind">{t('admin.payments.kind')}</label>
          <select id="pay-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as PaymentKind | '')}>
            <option value="">{t('admin.all')}</option>
            {(['charge', 'refund', 'activation_fee'] as const).map((k) => <option key={k} value={k}>{t(`admin.payments.kinds.${k}`)}</option>)}
          </select>
        </div>
        {state.status === 'ready' && (
          <button type="button" className="btn" onClick={() => exportCsv(state.data)}>{t('admin.exportCsv')}</button>
        )}
      </div>
      <Loaded state={state} reload={reload}>
        {(payments) => (
          <>
            <p className="label-muted" role="status">{t('admin.payments.count', { count: payments.length, formatted: format.number(payments.length) })}</p>
            {payments.length > 0 && <PaymentsTable payments={payments} />}
          </>
        )}
      </Loaded>
    </AdminLayout>
  );
}

// ---------------------------------------------------------------- activations & promos

export function AdminActivationsPage() {
  const { t } = useTranslation();
  const api = useAdminApi();
  const { state, reload } = useLoad(() => api.listActivations(), [api]);
  return (
    <AdminLayout title={t('admin.nav.activations')}>
      <Loaded state={state} reload={reload}>
        {(rows) => (
          <div className="card table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('support.event')}</th>
                  <th scope="col">{t('orders.statusLabel')}</th>
                  <th scope="col" className="num">{t('admin.activations.fee')}</th>
                  <th scope="col">{t('admin.payments.reference')}</th>
                  <th scope="col">{t('admin.activations.activated')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.eventId}>
                    <th scope="row">{r.eventTitle}<span className="kpi__sub">{r.organizerName}</span></th>
                    <td>{t(`paidSales.state.${r.state}`)}{r.suspensionReason && <span className="kpi__sub">{r.suspensionReason}</span>}</td>
                    <td className="num"><Money amount={r.feeAmount} />{r.simulated && <SimTag />}</td>
                    <td className="ticket__id">{r.feeReference ?? '—'}</td>
                    <td>{r.activatedAt ? <DateTimeText value={r.activatedAt} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loaded>
    </AdminLayout>
  );
}

export function AdminPromosPage() {
  const { t } = useTranslation();
  const api = useAdminApi();
  const { state, reload } = useLoad(() => api.listPromoActivity(), [api]);
  return (
    <AdminLayout title={t('admin.nav.promos')}>
      <Loaded state={state} reload={reload}>
        {(rows) => (
          <div className="card table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('analytics.code')}</th>
                  <th scope="col">{t('support.event')}</th>
                  <th scope="col">{t('orders.statusLabel')}</th>
                  <th scope="col" className="num">{t('analytics.redemptions')}</th>
                  <th scope="col" className="num">{t('analytics.discounts')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.eventTitle}-${r.code}`}>
                    <th scope="row" className="ticket__id">{r.code}</th>
                    <td>{r.eventTitle}</td>
                    <td>{r.status}</td>
                    <td className="num">{r.redemptions}</td>
                    <td className="num"><Money amount={r.discountTotal} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loaded>
    </AdminLayout>
  );
}

// ---------------------------------------------------------------- settings

export function AdminSettingsPage() {
  const { t } = useTranslation();
  const api = useAdminApi();
  const { state, reload } = useLoad(() => api.getSettings(), [api]);
  return (
    <AdminLayout title={t('admin.nav.settings')}>
      <Loaded state={state} reload={reload}>{(settings) => <SettingsForm initial={settings} />}</Loaded>
    </AdminLayout>
  );
}

function SettingsForm({ initial }: { initial: PlatformSettings }) {
  const { t } = useTranslation();
  const api = useAdminApi();
  const describeError = useDescribeError();
  const [values, setValues] = useState({
    activationFee: String(initial.activationFee),
    processingFeePercent: String(initial.processingFeePercent),
    holdMinutes: String(initial.holdMinutes),
    supportEmail: initial.supportEmail,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof values, string>>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const found: typeof errors = {};
    if (!/^\d+$/.test(values.activationFee)) found.activationFee = t('admin.settings.wholeTenge');
    if (!/^\d+(\.\d{1,2})?$/.test(values.processingFeePercent) || Number(values.processingFeePercent) > 20) found.processingFeePercent = t('admin.settings.percentRange');
    if (!/^\d+$/.test(values.holdMinutes) || Number(values.holdMinutes) < 2 || Number(values.holdMinutes) > 60) found.holdMinutes = t('admin.settings.holdRange');
    if (!/^\S+@\S+\.\S+$/.test(values.supportEmail)) found.supportEmail = t('staff.emailInvalid');
    setErrors(found);
    if (Object.keys(found).length) return;
    try {
      await api.updateSettings({
        activationFee: Number(values.activationFee),
        processingFeePercent: Number(values.processingFeePercent),
        holdMinutes: Number(values.holdMinutes),
        supportEmail: values.supportEmail.trim(),
      });
      setStatus({ ok: true, text: t('admin.settings.saved') });
    } catch (err) {
      setStatus({ ok: false, text: describeError(err) });
    }
  }

  const field = (name: keyof typeof values, label: string, hint?: string) => (
    <FormField id={`set-${name}`} label={label} hint={hint} error={errors[name]}>
      {(control) => <input {...control} className="input" value={values[name]} onChange={(e) => setValues({ ...values, [name]: e.target.value })} />}
    </FormField>
  );

  return (
    <form className="card profile-page" onSubmit={save} noValidate aria-label={t('admin.nav.settings')}>
      <div className="form-grid">
        {field('activationFee', t('admin.settings.activationFee'), t('admin.settings.activationFeeHint'))}
        {field('processingFeePercent', t('admin.settings.processingFee'), t('admin.settings.processingFeeHint'))}
        {field('holdMinutes', t('admin.settings.holdMinutes'))}
        {field('supportEmail', t('admin.settings.supportEmail'))}
      </div>
      {status && <p className={status.ok ? 'notice' : 'notice notice--danger'} role={status.ok ? 'status' : 'alert'}>{status.text}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn--primary">{t('admin.settings.save')}</button>
      </div>
    </form>
  );
}
