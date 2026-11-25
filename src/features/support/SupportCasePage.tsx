import '../orders/orders.css';
import './support.css';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useSupportApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import { SUPPORT_STATUSES, type SupportCase, type SupportStatus } from '../../api/support';
import { DateTimeText } from '../../components/DateTimeText';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { useLoad } from '../orders/useLoad';
import { SupportStatusBadge } from './parts';

/** `/support/:id`: the case's message thread, reply box, and staff controls (SRS 4.13). */
export function SupportCasePage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const api = useSupportApi();
  const { state, reload } = useLoad(() => api.getCase(id), [api, id]);
  const [current, setCurrent] = useState<SupportCase | null>(null);

  useEffect(() => {
    if (state.status === 'ready') setCurrent(state.data);
  }, [state]);

  if (state.status === 'loading' && !current) return <LoadingState label={t('support.loadingOne')} />;
  if (state.status === 'error') return <ErrorState title={t('support.loadErrorOne')} message={state.message} onRetry={reload} />;
  if (!current) return null;
  return <CaseView supportCase={current} onChange={setCurrent} />;
}

function CaseView({ supportCase: c, onChange }: { supportCase: SupportCase; onChange: (c: SupportCase) => void }) {
  const { t } = useTranslation();
  const api = useSupportApi();
  const describeError = useDescribeError();
  const [body, setBody] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<SupportStatus>(c.status);
  const [assignee, setAssignee] = useState(c.assignee?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [manageMessage, setManageMessage] = useState<string | null>(null);

  async function reply(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setReplyError(t('support.form.messageRequired'));
      return;
    }
    setSending(true);
    setReplyError(null);
    try {
      onChange(await api.reply(c.id, body));
      setBody('');
    } catch (err) {
      setReplyError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setManageMessage(null);
    try {
      const updated = await api.updateCase(c.id, { status, assigneeId: assignee || null });
      onChange(updated);
      setManageMessage(t('support.saved'));
    } catch (err) {
      setManageMessage(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  const { context } = c;
  return (
    <div className="support-case">
      <Link to={paths.support} className="back-link">
        {t('support.back')}
      </Link>
      <div className="support-case__head">
        <div>
          <p className="eyebrow">
            {c.number} · {t(`support.category.${c.category}`)} · {c.kind === 'organizer' ? t('support.kind.organizer') : t('support.kind.attendee')}
          </p>
          <h1 className="section-title">{c.subject}</h1>
        </div>
        <SupportStatusBadge status={c.status} />
      </div>

      <dl className="support-case__context">
        <div>
          <dt className="label-muted">{t('support.requester')}</dt>
          <dd>{c.requester.name}</dd>
        </div>
        <div>
          <dt className="label-muted">{t('support.assignee')}</dt>
          <dd>{c.assignee?.name ?? t('support.unassigned')}</dd>
        </div>
        {context.event && (
          <div>
            <dt className="label-muted">{t('support.event')}</dt>
            <dd>
              <Link to={paths.publicEvent(context.event.id)}>{context.event.title}</Link>
            </dd>
          </div>
        )}
        {context.order && (
          <div>
            <dt className="label-muted">{t('support.order')}</dt>
            <dd>{context.order.number}</dd>
          </div>
        )}
        {context.ticket && (
          <div>
            <dt className="label-muted">{t('support.ticket')}</dt>
            <dd className="ticket__id">{context.ticket.id}</dd>
          </div>
        )}
      </dl>

      <div className="support-case__layout">
        <section aria-labelledby="thread-heading">
          <h2 id="thread-heading" className="sr-only">
            {t('support.thread')}
          </h2>
          <ol className="support-thread">
            {c.messages.map((m) => (
              <li key={m.id} className={`support-message support-message--${m.author.side}`}>
                <p className="support-message__meta">
                  <strong>{m.author.name}</strong>
                  {m.author.side === 'staff' && <span className="support-message__role">{t('support.staffLabel')}</span>}
                  <DateTimeText value={m.createdAt} />
                </p>
                <p className="support-message__body">{m.body}</p>
              </li>
            ))}
          </ol>

          <form className="card support-reply" onSubmit={reply} noValidate>
            <label className="field__label" htmlFor="reply-body">
              {t('support.reply')}
            </label>
            <textarea
              id="reply-body"
              className="input"
              rows={4}
              value={body}
              aria-invalid={Boolean(replyError)}
              aria-describedby={replyError ? 'reply-error' : undefined}
              onChange={(e) => setBody(e.target.value)}
            />
            {replyError && (
              <p id="reply-error" className="field__error" role="alert">
                {replyError}
              </p>
            )}
            {c.status === 'resolved' && <p className="label-muted">{t('support.resolvedNote')}</p>}
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={sending}>
                {sending ? t('common.working') : t('support.send')}
              </button>
            </div>
          </form>
        </section>

        {c.canManage && (
          <form className="card support-manage" onSubmit={save} aria-labelledby="manage-heading">
            <h2 id="manage-heading" className="card__title">
              {t('support.manage')}
            </h2>
            <label className="field__label" htmlFor="case-status">
              {t('support.statusLabel')}
            </label>
            <select id="case-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as SupportStatus)}>
              {SUPPORT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`support.status.${s}`)}
                </option>
              ))}
            </select>
            <label className="field__label" htmlFor="case-assignee">
              {t('support.assignee')}
            </label>
            <select id="case-assignee" className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">{t('support.unassigned')}</option>
              {c.assignableStaff.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? t('common.working') : t('support.save')}
            </button>
            <p className="label-muted" role="status">
              {manageMessage}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
