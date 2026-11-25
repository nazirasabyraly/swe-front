import '../orders/orders.css';
import './support.css';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useSupportApi } from '../../api/ApiContext';
import type { SupportCaseSummary } from '../../api/support';
import { hasRole, useAuth } from '../../auth/AuthContext';
import { DateTimeText } from '../../components/DateTimeText';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { useLoad } from '../orders/useLoad';
import { SupportStatusBadge } from './parts';

/** `/support`: the user's own requests, plus the cases they handle if they're organizer or admin staff. */
export function SupportListPage() {
  const { t } = useTranslation();
  const api = useSupportApi();
  const { user } = useAuth();
  const isStaff = hasRole(user, 'organizer') || hasRole(user, 'platform_admin');
  const mine = useLoad(() => api.listMyCases(), [api]);
  const managed = useLoad(() => (isStaff ? api.listManagedCases() : Promise.resolve([])), [api, isStaff]);

  return (
    <div>
      <h1 className="section-title">{t('support.title')}</h1>
      <div className="support-list__actions">
        {hasRole(user, 'organizer') && (
          <Link to={paths.newSupportCase({ kind: 'organizer' })} className="btn">
            {t('support.contactPlatform')}
          </Link>
        )}
        <Link to={paths.newSupportCase()} className="btn btn--primary">
          {t('support.newCase')}
        </Link>
      </div>

      {isStaff && (
        <CaseSection id="managed" title={t('support.managedTitle')} empty={t('support.managedEmpty')} state={managed.state} reload={managed.reload} showRequester />
      )}
      <CaseSection id="mine" title={t('support.mineTitle')} empty={t('support.mineEmpty')} state={mine.state} reload={mine.reload} />
    </div>
  );
}

interface CaseSectionProps {
  id: string;
  title: string;
  empty: string;
  state: ReturnType<typeof useLoad<SupportCaseSummary[]>>['state'];
  reload: () => void;
  showRequester?: boolean;
}

function CaseSection({ id, title, empty, state, reload, showRequester = false }: CaseSectionProps) {
  const { t } = useTranslation();
  return (
    <section className="support-section" aria-labelledby={`support-${id}`}>
      <h2 id={`support-${id}`} className="ticket-group__title">
        {title}
      </h2>
      {state.status === 'loading' && <LoadingState label={t('support.loading')} />}
      {state.status === 'error' && <ErrorState title={t('support.loadError')} message={state.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.length === 0 && <EmptyState headingLevel={3} title={empty} />}
      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="support-cases">
          {state.data.map((c) => (
            <li key={c.id} className="panel support-case-row">
              <div className="support-case-row__main">
                <Link to={paths.supportCase(c.id)} className="support-case-row__subject">
                  {c.subject}
                </Link>
                <p className="label-muted">
                  {c.number} · {t(`support.category.${c.category}`)}
                  {c.context.event && ` · ${c.context.event.title}`}
                  {showRequester && ` · ${c.requester.name}`}
                </p>
                <p className="label-muted">
                  {t('support.updated')} <DateTimeText value={c.updatedAt} />
                  {c.assignee && ` · ${t('support.assignedTo', { name: c.assignee.name })}`}
                </p>
              </div>
              <SupportStatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
