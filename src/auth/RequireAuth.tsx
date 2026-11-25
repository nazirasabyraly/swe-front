import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import type { Role } from '../api/auth';
import { LoadingState } from '../components/DataStates';
import { paths } from '../routes';
import { useAuth } from './AuthContext';

interface RequireAuthProps {
  /** The user needs at least one of these roles. Omit to require only a session. */
  roles?: Role[];
  children?: ReactNode;
}

/**
 * Route guard. Anonymous visitors go to sign-in and come back afterwards;
 * signed-in users without the role see a "no access" page.
 * The server still enforces permissions; this only shapes the UI.
 */
export function RequireAuth({ roles, children }: RequireAuthProps) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <LoadingState />;

  if (state.status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${paths.signIn}?next=${next}`} replace />;
  }

  if (roles && !roles.some((role) => state.user.roles.includes(role))) return <ForbiddenPage />;

  return <>{children ?? <Outlet />}</>;
}

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <section className="card empty-state">
      <h1 className="card__title">{t('auth.forbidden.title')}</h1>
      <p className="label-muted">{t('auth.forbidden.body')}</p>
      <Link to={paths.home} className="btn">
        {t('auth.forbidden.home')}
      </Link>
    </section>
  );
}
