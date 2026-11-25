import './ticket-types.css';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useTicketTypesApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import type { OrganizerEvent } from '../../api/events';
import type { TicketType, TicketTypeInput } from '../../api/ticketTypes';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { useFormat } from '../../i18n/useFormat';
import { usePaidSales } from '../paid-sales/usePaidSales';
import { draftFromTicketType, newTicketTypeDraft } from './model';
import { TicketTypeForm } from './TicketTypeForm';
import { TicketTypeRow } from './TicketTypeRow';
import { useTicketTypes } from './useTicketTypes';

interface TicketTypesManagerProps {
  event: OrganizerEvent;
  now?: () => Date;
  /** Called with the current list after every load or change. */
  onTypesChange?: (types: TicketType[]) => void;
  /** Where the organizer completes paid-sales activation for this event. */
  activationHref: string;
}

type Editing = { mode: 'new' } | { mode: 'edit'; type: TicketType } | null;

/** List, add, edit, hide and delete an event's ticket types (SRS 4.3). Changes save immediately. */
export function TicketTypesManager({
  event,
  now = () => new Date(),
  onTypesChange,
  activationHref,
}: TicketTypesManagerProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const api = useTicketTypesApi();
  const describeError = useDescribeError();
  const { state, reload, upsert, remove } = useTicketTypes(event.id);
  const { state: paidSalesState } = usePaidSales(event.id);
  const [editing, setEditing] = useState<Editing>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<TicketType | null>(null);

  const types = state.status === 'ready' ? state.types : null;
  useEffect(() => {
    if (types) onTypesChange?.(types);
  }, [types, onTypesChange]);

  function openForm(next: Editing) {
    setFormError(null);
    setEditing(next);
  }

  async function save(input: TicketTypeInput) {
    setFormError(null);
    try {
      const saved =
        editing?.mode === 'edit'
          ? await api.updateTicketType(event.id, editing.type.id, input)
          : await api.createTicketType(event.id, input);
      upsert(saved);
      setEditing(null);
    } catch (err) {
      setFormError(describeError(err));
    }
  }

  async function toggleHidden(type: TicketType) {
    setPendingId(type.id);
    setRowErrors(({ [type.id]: _cleared, ...rest }) => rest);
    try {
      upsert(await api.setTicketTypeHidden(event.id, type.id, !type.hidden));
    } catch (err) {
      setRowErrors((e) => ({ ...e, [type.id]: describeError(err) }));
    } finally {
      setPendingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    await api.deleteTicketType(event.id, deleting.id); // errors are shown inside the dialog
    remove(deleting.id);
    setDeleting(null);
  }

  const formFor = (title: string, editingType?: TicketType) => (
    <TicketTypeForm
      key={editingType?.id ?? 'new'}
      title={title}
      initialDraft={editingType ? draftFromTicketType(editingType, event.timeZone) : newTicketTypeDraft(event)}
      context={{
        timeZone: event.timeZone,
        eventEndsAt: event.endsAt,
        minQuantity: editingType ? editingType.counts.sold + editingType.counts.reserved : 0,
      }}
      onSave={save}
      onCancel={() => setEditing(null)}
      serverError={formError}
    />
  );

  if (state.status === 'loading' || paidSalesState.status === 'loading') {
    return <LoadingState label={t('ticketTypes.loading')} />;
  }
  if (state.status === 'error') {
    return <ErrorState title={t('ticketTypes.loadError')} message={state.message} onRetry={reload} />;
  }

  const visible = state.types.filter((type) => !type.hidden);
  const totalQuantity = visible.reduce((sum, type) => sum + type.quantity, 0);
  const hasPaid = state.types.some((type) => type.kind === 'paid');
  const nowDate = now();
  // If the activation status can't be loaded, paid types are shown as not purchasable.
  const paidSales = paidSalesState.status === 'ready' ? paidSalesState.paidSales : null;
  const salesState = paidSales?.state ?? 'unknown';

  return (
    <section className="card" aria-labelledby="ticket-types-heading">
      <div className="ticket-types__header">
        <div>
          <h2 id="ticket-types-heading" className="card__title">
            {t('ticketTypes.title')}
          </h2>
          <p className="label-muted ticket-types__subtitle">{t('ticketTypes.subtitle')}</p>
        </div>
        {editing?.mode !== 'new' && (
          <button type="button" className="btn btn--primary" onClick={() => openForm({ mode: 'new' })}>
            {t('ticketTypes.add')}
          </button>
        )}
      </div>

      {hasPaid && salesState === 'suspended' && (
        <div className="notice notice--danger ticket-types__notice" role="note">
          <strong>{t('paidSales.suspendedTitle')}</strong>
          {t('paidSales.suspendedBody', { reason: paidSales?.suspension?.reason ?? '' })}
        </div>
      )}
      {hasPaid && salesState !== 'suspended' && salesState !== 'active' && (
        <p className="notice ticket-types__notice" role="note">
          {t('ticketTypes.paidNotice')}{' '}
          <Link to={activationHref}>{t('ticketTypes.completeActivation')}</Link>
        </p>
      )}
      {totalQuantity > event.capacity && (
        <p className="notice ticket-types__notice" role="note">
          {t('ticketTypes.capacityWarning', {
            total: format.number(totalQuantity),
            capacity: format.number(event.capacity),
          })}
        </p>
      )}

      {editing?.mode === 'new' && formFor(t('ticketTypes.form.addTitle'))}

      {state.types.length === 0 && editing?.mode !== 'new' && (
        <EmptyState headingLevel={3} title={t('ticketTypes.emptyTitle')} description={t('ticketTypes.emptyBody')} />
      )}

      {state.types.length > 0 && (
        <ul className="ticket-types__list">
          {state.types.map((type) =>
            editing?.mode === 'edit' && editing.type.id === type.id ? (
              <li key={type.id}>{formFor(t('ticketTypes.form.editTitle', { name: type.name }), type)}</li>
            ) : (
              <TicketTypeRow
                key={type.id}
                type={type}
                paidSales={salesState}
                timeZone={event.timeZone}
                now={nowDate}
                pending={pendingId === type.id}
                error={rowErrors[type.id]}
                onEdit={() => openForm({ mode: 'edit', type })}
                onToggleHidden={() => toggleHidden(type)}
                onDelete={() => setDeleting(type)}
              />
            ),
          )}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={t('ticketTypes.actions.deleteTitle', { name: deleting?.name ?? '' })}
        confirmLabel={t('ticketTypes.actions.delete')}
        tone="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      >
        {t('ticketTypes.actions.deleteBody')}
      </ConfirmDialog>
    </section>
  );
}
