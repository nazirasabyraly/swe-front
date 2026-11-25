import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { SupportStatus } from '../../api/support';
import { StatusBadge, type StatusTone } from '../../components/StatusBadge';
import { paths } from '../../routes';

const TONES: Record<SupportStatus, StatusTone> = {
  open: 'info',
  in_progress: 'warning',
  waiting_for_customer: 'neutral',
  resolved: 'success',
};

export function SupportStatusBadge({ status }: { status: SupportStatus }) {
  const { t } = useTranslation();
  return <StatusBadge tone={TONES[status]}>{t(`support.status.${status}`)}</StatusBadge>;
}

/** "Get help" from an event, order or ticket page; the case opens with that context attached. */
export function GetHelpLink(props: Parameters<typeof paths.newSupportCase>[0] & { className?: string }) {
  const { t } = useTranslation();
  const { className = 'btn', ...context } = props;
  return (
    <Link to={paths.newSupportCase(context)} className={className}>
      {t('support.getHelp')}
    </Link>
  );
}
