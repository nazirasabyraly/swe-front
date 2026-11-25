import '../orders/orders.css';
import './support.css';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useSupportApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import { ATTENDEE_CATEGORIES, ORGANIZER_CATEGORIES, type SupportCategory } from '../../api/support';
import { FormField } from '../../components/FormField';
import { paths } from '../../routes';

const SUBJECT_MAX = 120;
const MESSAGE_MAX = 4000;

/**
 * `/support/new?kind=&event=&order=&ticket=&about=`: opens a case. Attendee cases go to the event's
 * organizer; organizer cases (`kind=organizer`) go to BiletFlow platform support (SRS 4.13).
 */
export function NewCasePage() {
  const { t } = useTranslation();
  const api = useSupportApi();
  const navigate = useNavigate();
  const describeError = useDescribeError();
  const [params] = useSearchParams();
  const kind = params.get('kind') === 'organizer' ? 'organizer' : 'attendee';
  const categories = kind === 'organizer' ? ORGANIZER_CATEGORIES : ATTENDEE_CATEGORIES;
  const context = { eventId: params.get('event') ?? undefined, orderId: params.get('order') ?? undefined, ticketId: params.get('ticket') ?? undefined };
  const about = params.get('about');

  const [category, setCategory] = useState<SupportCategory | ''>('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<{ category?: string; subject?: string; message?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = {
      category: category ? undefined : t('support.form.categoryRequired'),
      subject: !subject.trim() ? t('support.form.subjectRequired') : subject.trim().length > SUBJECT_MAX ? t('support.form.tooLong', { max: SUBJECT_MAX }) : undefined,
      message: !message.trim() ? t('support.form.messageRequired') : message.trim().length > MESSAGE_MAX ? t('support.form.tooLong', { max: MESSAGE_MAX }) : undefined,
    };
    setErrors(found);
    const first = (['category', 'subject', 'message'] as const).find((k) => found[k]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#case-${first}`)?.focus();
      return;
    }
    setSending(true);
    setServerError(null);
    try {
      const created = await api.openCase({ kind, category: category as SupportCategory, subject, message, ...context });
      navigate(paths.supportCase(created.id), { replace: true });
    } catch (err) {
      setServerError(describeError(err));
      setSending(false);
    }
  }

  return (
    <div className="support-new">
      <Link to={paths.support} className="back-link">
        {t('support.back')}
      </Link>
      <h1 className="section-title">{kind === 'organizer' ? t('support.newOrganizerTitle') : t('support.newTitle')}</h1>
      <p className="section-subtitle">{kind === 'organizer' ? t('support.newOrganizerSubtitle') : t('support.newSubtitle')}</p>

      <form ref={formRef} className="card" onSubmit={submit} noValidate aria-label={t('support.newTitle')}>
        {(about || context.eventId || context.orderId || context.ticketId) && (
          <div className="notice support-new__context" role="note">
            <strong>{t('support.form.contextTitle')}</strong>
            {about ?? [context.orderId, context.ticketId, context.eventId].filter(Boolean).join(' · ')}
          </div>
        )}
        {serverError && (
          <div className="notice notice--danger form-summary" role="alert">
            <strong>{t('support.form.sendError')}</strong>
            {serverError}
          </div>
        )}
        <div className="support-new__fields">
          <FormField id="case-category" label={t('support.form.category')} error={errors.category}>
            {(control) => (
              <select {...control} className="input" value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
                <option value="">{t('support.form.categoryPlaceholder')}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {t(`support.category.${c}`)}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField id="case-subject" label={t('support.form.subject')} error={errors.subject}>
            {(control) => <input {...control} className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />}
          </FormField>
          <FormField id="case-message" label={t('support.form.message')} hint={t('support.form.messageHint')} error={errors.message}>
            {(control) => (
              <textarea {...control} className="input" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
            )}
          </FormField>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={sending}>
            {sending ? t('common.working') : t('support.form.send')}
          </button>
        </div>
      </form>
    </div>
  );
}
