import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { paths } from '../../routes';

/** Basic account details. The organizer profile (contact + payout) is a later feature. */
export function AccountPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null; // Rendered behind <RequireAuth>.

  return (
    <section className="card account-card">
      <h1 className="card__title">{t('account.title')}</h1>
      <dl className="account-card__facts">
        <div>
          <dt className="label-muted">{t('auth.fields.name')}</dt>
          <dd>{user.name}</dd>
        </div>
        <div>
          <dt className="label-muted">{t('auth.fields.email')}</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt className="label-muted">{t('account.roles')}</dt>
          <dd>{user.roles.map((role) => t(`account.role.${role}`)).join(', ')}</dd>
        </div>
      </dl>
      <p className="account-card__links">
        <Link to={paths.myTickets}>{t('nav.myTickets')}</Link> · <Link to={paths.myOrders}>{t('orders.title')}</Link>
      </p>
    </section>
  );
}
