import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { latestMockEmail, type MockEmail } from './outbox';

/**
 * Demo mode only: there is no real inbox, so show the link the mock backend "emailed".
 * Render it as `{USE_MOCKS && <MockEmailLink … />}` so production builds drop it.
 */
export function MockEmailLink({ to, kind }: { to: string; kind: MockEmail['kind'] }) {
  const { t } = useTranslation();
  const email = latestMockEmail(to, kind);
  if (!email) return null;
  return (
    <p className="mock-banner">
      <Link to={email.link}>{t('auth.mockEmailLink')}</Link>
    </p>
  );
}
