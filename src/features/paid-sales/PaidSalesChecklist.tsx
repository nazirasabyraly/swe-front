import './paid-sales.css';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePaidSalesApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import type { ActivationItem, PaidSalesStatus } from '../../api/paidSales';
import { DateTimeText } from '../../components/DateTimeText';
import { FormField } from '../../components/FormField';
import { StatusBadge, type StatusTone } from '../../components/StatusBadge';
import { useFormat } from '../../i18n/useFormat';
import { validateIdentity, validatePayout, type PaidSalesValidationKey } from './validation';

interface PaidSalesChecklistProps {
  paidSales: PaidSalesStatus;
  timeZone: string;
  /** Called with the status the server returned after each step. */
  onChange: (status: PaidSalesStatus) => void;
}

const STATE_TONES: Record<PaidSalesStatus['state'], StatusTone> = {
  not_started: 'neutral',
  in_progress: 'info',
  active: 'success',
  suspended: 'danger',
};

/**
 * The per-event activation checklist from prototype screen 3 (SRS 4.5).
 * Each step is sent to the server, which decides what's done; the UI only shows it.
 */
export function PaidSalesChecklist({ paidSales, timeZone, onChange }: PaidSalesChecklistProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const api = usePaidSalesApi();
  const describeError = useDescribeError();
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const { state, checklist, simulated } = paidSales;
  const editable = state === 'not_started' || state === 'in_progress';
  const allDone = Object.values(checklist).every((item) => item.done);
  const eventId = paidSales.eventId;

  async function activate() {
    setActivating(true);
    setActivateError(null);
    try {
      onChange(await api.activate(eventId));
    } catch (err) {
      setActivateError(describeError(err));
    } finally {
      setActivating(false);
    }
  }

  return (
    <section className="card activation" aria-labelledby="activation-heading">
      <div className="activation__header">
        <h2 id="activation-heading" className="card__title">
          {t('paidSales.title')}
        </h2>
        {simulated && (
          <span className="sim-label" aria-describedby="activation-sim-note">
            {t('paidSales.simulationLabel')}
          </span>
        )}
      </div>
      {simulated && (
        <p id="activation-sim-note" className="label-muted activation__sim-note">
          {t('paidSales.simulationNote')}
        </p>
      )}

      <p className="activation__state">
        <StatusBadge tone={STATE_TONES[state]}>{t(`paidSales.state.${state}`)}</StatusBadge>
      </p>

      {state === 'suspended' && paidSales.suspension && (
        <div className="notice notice--danger activation__notice" role="alert">
          <strong>{t('paidSales.suspendedTitle')}</strong>
          {t('paidSales.suspendedBody', { reason: paidSales.suspension.reason })}{' '}
          <DateTimeText value={paidSales.suspension.suspendedAt} timeZone={timeZone} />
        </div>
      )}

      <ol className="activation__list">
        <ChecklistItem item="identity" done={checklist.identity.done} detail={
          checklist.identity.verifiedName && t('paidSales.identity.doneDetail', { name: checklist.identity.verifiedName })
        }>
          {editable && <IdentityForm eventId={eventId} onChange={onChange} />}
        </ChecklistItem>

        <ChecklistItem item="payout" done={checklist.payout.done} detail={
          checklist.payout.accountLast4 && t('paidSales.payout.doneDetail', { last4: checklist.payout.accountLast4 })
        }>
          {editable && <PayoutForm eventId={eventId} onChange={onChange} />}
        </ChecklistItem>

        <ChecklistItem
          item="fee"
          done={checklist.fee.done}
          description={t('paidSales.fee.description', { fee: format.kzt(paidSales.activationFee) })}
          detail={
            checklist.fee.paidAt && (
              <>
                {t('paidSales.fee.doneDetail', { reference: checklist.fee.reference ?? '—' })}{' · '}
                <DateTimeText value={checklist.fee.paidAt} timeZone={timeZone} />
              </>
            )
          }
        >
          {editable && (
            <ActionButton
              label={t(simulated ? 'paidSales.fee.paySimulated' : 'paidSales.fee.pay', {
                fee: format.kzt(paidSales.activationFee),
              })}
              run={() => api.payActivationFee(eventId)}
              onChange={onChange}
            />
          )}
        </ChecklistItem>

        <ChecklistItem item="terms" done={checklist.terms.done} detail={
          checklist.terms.acceptedAt && (
            <>
              {t('paidSales.terms.doneDetail', { version: paidSales.termsVersion })}{' · '}
              <DateTimeText value={checklist.terms.acceptedAt} timeZone={timeZone} />
            </>
          )
        }>
          {editable && <TermsForm eventId={eventId} termsVersion={paidSales.termsVersion} onChange={onChange} />}
        </ChecklistItem>
      </ol>

      {state === 'active' ? (
        <div className="notice activation__notice" role="status">
          <strong>{t('paidSales.activeTitle')}</strong>
          {paidSales.activatedAt && (
            <>
              {t('paidSales.activeSince')} <DateTimeText value={paidSales.activatedAt} timeZone={timeZone} />
            </>
          )}
        </div>
      ) : (
        editable && (
          <div className="activation__footer">
            {activateError && (
              <p className="field__error" role="alert">
                {activateError}
              </p>
            )}
            <button
              type="button"
              className="btn btn--primary"
              disabled={!allDone || activating}
              aria-describedby={allDone ? undefined : 'activation-hint'}
              onClick={activate}
            >
              {activating ? t('common.working') : t('paidSales.activate')}
            </button>
            {!allDone && (
              <p id="activation-hint" className="label-muted">
                {t('paidSales.activateHint')}
              </p>
            )}
          </div>
        )
      )}
    </section>
  );
}

interface ChecklistItemProps {
  item: ActivationItem;
  done: boolean;
  description?: ReactNode;
  detail?: ReactNode;
  /** The form or button that completes the step; only rendered while it's open. */
  children?: ReactNode;
}

function ChecklistItem({ item, done, description, detail, children }: ChecklistItemProps) {
  const { t } = useTranslation();
  const titleId = `activation-${item}`;
  return (
    <li className={`panel activation-item${done ? ' activation-item--done' : ''}`} aria-labelledby={titleId}>
      <div className="activation-item__head">
        <div>
          <h3 id={titleId} className="activation-item__title">
            {t(`paidSales.${item}.title`)}
          </h3>
          <p className="label-muted">{description ?? t(`paidSales.${item}.description`)}</p>
        </div>
        <StatusBadge tone={done ? 'success' : 'neutral'}>
          {done ? t('paidSales.itemDone') : t('paidSales.itemTodo')}
        </StatusBadge>
      </div>
      {done ? detail && <p className="activation-item__detail">{detail}</p> : children}
    </li>
  );
}

type Mutation = () => Promise<PaidSalesStatus>;

/** Runs one checklist mutation and reports server errors next to it. */
function useMutation(onChange: (status: PaidSalesStatus) => void) {
  const describeError = useDescribeError();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(mutation: Mutation) {
    setPending(true);
    setError(null);
    try {
      onChange(await mutation());
    } catch (err) {
      setError(describeError(err));
      setPending(false);
    }
  }
  return { pending, error, run };
}

function ServerError({ message }: { message: string | null }) {
  return message ? (
    <p className="field__error" role="alert">
      {message}
    </p>
  ) : null;
}

function ActionButton({ label, run: mutation, onChange }: { label: ReactNode; run: Mutation; onChange: (s: PaidSalesStatus) => void }) {
  const { t } = useTranslation();
  const { pending, error, run } = useMutation(onChange);
  return (
    <div className="activation-item__form">
      <ServerError message={error} />
      <button type="button" className="btn btn--small" disabled={pending} onClick={() => run(mutation)}>
        {pending ? t('common.working') : label}
      </button>
    </div>
  );
}

type FieldErrors<K extends string> = Partial<Record<K, PaidSalesValidationKey>>;

function IdentityForm({ eventId, onChange }: { eventId: string; onChange: (s: PaidSalesStatus) => void }) {
  const { t } = useTranslation();
  const api = usePaidSalesApi();
  const { pending, error, run } = useMutation(onChange);
  const [fullName, setFullName] = useState('');
  const [iin, setIin] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'fullName' | 'iin'>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateIdentity({ fullName, iin });
    setErrors(found);
    if (Object.keys(found).length === 0) run(() => api.verifyIdentity(eventId, { fullName: fullName.trim(), iin: iin.trim() }));
  }

  return (
    <form className="activation-item__form" onSubmit={submit} noValidate aria-label={t('paidSales.identity.title')}>
      <div className="form-grid">
        <FormField id="identity-name" label={t('paidSales.identity.fullName')} error={errors.fullName && t(errors.fullName)}>
          {(control) => (
            <input {...control} className="input" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          )}
        </FormField>
        <FormField id="identity-iin" label={t('paidSales.identity.iin')} hint={t('paidSales.identity.iinHint')} error={errors.iin && t(errors.iin)}>
          {(control) => (
            <input {...control} className="input" inputMode="numeric" maxLength={12} value={iin} onChange={(e) => setIin(e.target.value)} />
          )}
        </FormField>
      </div>
      <ServerError message={error} />
      <button type="submit" className="btn btn--small" disabled={pending}>
        {pending ? t('common.working') : t('paidSales.identity.submit')}
      </button>
    </form>
  );
}

function PayoutForm({ eventId, onChange }: { eventId: string; onChange: (s: PaidSalesStatus) => void }) {
  const { t } = useTranslation();
  const api = usePaidSalesApi();
  const { pending, error, run } = useMutation(onChange);
  const [accountHolder, setAccountHolder] = useState('');
  const [iban, setIban] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'accountHolder' | 'iban'>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = validatePayout({ accountHolder, iban });
    setErrors(found);
    if (Object.keys(found).length === 0) {
      run(() => api.connectPayout(eventId, { accountHolder: accountHolder.trim(), iban: iban.replace(/\s/g, '').toUpperCase() }));
    }
  }

  return (
    <form className="activation-item__form" onSubmit={submit} noValidate aria-label={t('paidSales.payout.title')}>
      <div className="form-grid">
        <FormField id="payout-holder" label={t('paidSales.payout.accountHolder')} error={errors.accountHolder && t(errors.accountHolder)}>
          {(control) => (
            <input {...control} className="input" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />
          )}
        </FormField>
        <FormField id="payout-iban" label={t('paidSales.payout.iban')} hint={t('paidSales.payout.ibanHint')} error={errors.iban && t(errors.iban)}>
          {(control) => (
            <input {...control} className="input" autoCapitalize="characters" spellCheck={false} value={iban} onChange={(e) => setIban(e.target.value)} />
          )}
        </FormField>
      </div>
      <ServerError message={error} />
      <button type="submit" className="btn btn--small" disabled={pending}>
        {pending ? t('common.working') : t('paidSales.payout.submit')}
      </button>
    </form>
  );
}

function TermsForm({ eventId, termsVersion, onChange }: { eventId: string; termsVersion: string; onChange: (s: PaidSalesStatus) => void }) {
  const { t } = useTranslation();
  const api = usePaidSalesApi();
  const { pending, error, run } = useMutation(onChange);
  const [accepted, setAccepted] = useState(false);
  const [showError, setShowError] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    setShowError(!accepted);
    if (accepted) run(() => api.acceptTerms(eventId, termsVersion));
  }

  return (
    <form className="activation-item__form" onSubmit={submit} noValidate aria-label={t('paidSales.terms.title')}>
      <ul className="activation-item__terms">
        <li>{t('paidSales.terms.refunds')}</li>
        <li>{t('paidSales.terms.chargebacks')}</li>
        <li>{t('paidSales.terms.obligations')}</li>
      </ul>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          aria-invalid={showError}
          aria-describedby={showError ? 'terms-error' : undefined}
        />
        {t('paidSales.terms.accept', { version: termsVersion })}
      </label>
      {showError && (
        <p id="terms-error" className="field__error">
          {t('paidSales.validation.termsRequired')}
        </p>
      )}
      <ServerError message={error} />
      <button type="submit" className="btn btn--small" disabled={pending}>
        {pending ? t('common.working') : t('paidSales.terms.submit')}
      </button>
    </form>
  );
}
