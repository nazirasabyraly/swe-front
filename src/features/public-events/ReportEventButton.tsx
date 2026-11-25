import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useAdminApi } from '../../api/ApiContext';
import { REPORT_REASONS, type ReportReason } from '../../api/admin';
import { useAuth } from '../../auth/AuthContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { paths } from '../../routes';

/** "Report this event" for platform moderation (SRS 4.12 "review reported events"). */
export function ReportEventButton({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const api = useAdminApi();
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);

  if (!user) {
    return (
      <Link to={`${paths.signIn}?next=${encodeURIComponent(location.pathname)}`} className="btn btn--small">
        {t('report.button')}
      </Link>
    );
  }
  if (sent) return <p className="label-muted" role="status">{t('report.sent')}</p>;

  return (
    <>
      <button type="button" className="btn btn--small" onClick={() => setOpen(true)}>
        {t('report.button')}
      </button>
      <ConfirmDialog
        open={open}
        title={t('report.title')}
        confirmLabel={t('report.send')}
        onConfirm={async () => {
          if (!reason) throw new Error(t('report.reasonRequired'));
          await api.reportEvent(eventId, { reason, details });
          setOpen(false);
          setSent(true);
        }}
        onClose={() => setOpen(false)}
      >
        <p>{t('report.body')}</p>
        <label className="field__label" htmlFor="report-reason">{t('report.reason')}</label>
        <select id="report-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
          <option value="">{t('support.form.categoryPlaceholder')}</option>
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>{t(`admin.reports.reasons.${r}`)}</option>
          ))}
        </select>
        <label className="field__label" htmlFor="report-details">{t('report.details')}</label>
        <textarea id="report-details" className="input" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
      </ConfirmDialog>
    </>
  );
}
