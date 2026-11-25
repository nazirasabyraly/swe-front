import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganizerApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import type { OrganizerEvent } from '../../api/events';
import type { StaffMember } from '../../api/organizer';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DateTimeText } from '../../components/DateTimeText';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { useLoad } from '../orders/useLoad';
import { EventAdminLayout } from './EventAdminLayout';

/** `/organizer/events/:id/staff`: Event Admins who can check tickets in with the mobile app (SRS 4.8). */
export function EventStaffPage() {
  return <EventAdminLayout>{(event) => <Staff event={event} />}</EventAdminLayout>;
}

function Staff({ event }: { event: OrganizerEvent }) {
  const { t } = useTranslation();
  const api = useOrganizerApi();
  const describeError = useDescribeError();
  const { state, reload } = useLoad(() => api.listStaff(event.id), [api, event.id]);
  const [added, setAdded] = useState<StaffMember[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<StaffMember | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(t('staff.emailInvalid'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const member = await api.addStaff(event.id, email.trim());
      setAdded((a) => [...a, member]);
      setRemoved((r) => r.filter((id) => id !== member.id));
      setEmail('');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!removing) return;
    await api.removeStaff(event.id, removing.id);
    setRemoved((r) => [...r, removing.id]);
    setAdded((a) => a.filter((m) => m.id !== removing.id));
    setRemoving(null);
  }

  if (state.status === 'loading') return <LoadingState label={t('staff.loading')} />;
  if (state.status === 'error') return <ErrorState title={t('staff.loadError')} message={state.message} onRetry={reload} />;
  const members = [...state.data, ...added.filter((m) => !state.data.some((s) => s.id === m.id))].filter((m) => !removed.includes(m.id));

  return (
    <section className="card" aria-labelledby="staff-heading">
      <h2 id="staff-heading" className="card__title">{t('staff.title')}</h2>
      <p className="label-muted ticket-types__subtitle">{t('staff.subtitle')}</p>

      <form className="analytics-filters" onSubmit={add} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="staff-email">{t('staff.email')}</label>
          <input
            id="staff-email"
            type="email"
            className="input"
            value={email}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'staff-error' : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn--primary" disabled={saving || event.status === 'cancelled'}>
          {saving ? t('common.working') : t('staff.add')}
        </button>
      </form>
      {error && <p id="staff-error" className="field__error" role="alert">{error}</p>}

      {members.length === 0 ? (
        <EmptyState headingLevel={3} title={t('staff.emptyTitle')} />
      ) : (
        <table className="data-table">
          <caption className="sr-only">{t('staff.title')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('auth.fields.name')}</th>
              <th scope="col">{t('auth.fields.email')}</th>
              <th scope="col">{t('staff.added')}</th>
              <th scope="col"><span className="sr-only">{t('eventOrders.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <th scope="row">{m.name}<span className="kpi__sub">{t('staff.role')}</span></th>
                <td>{m.email}</td>
                <td><DateTimeText value={m.addedAt} timeZone={event.timeZone} /></td>
                <td>
                  <button type="button" className="btn btn--small" onClick={() => setRemoving(m)} aria-label={t('staff.removeLabel', { name: m.name })}>
                    {t('staff.remove')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={t('staff.removeTitle', { name: removing?.name ?? '' })}
        confirmLabel={t('staff.remove')}
        tone="danger"
        onConfirm={remove}
        onClose={() => setRemoving(null)}
      >
        {t('staff.removeBody')}
      </ConfirmDialog>
    </section>
  );
}
