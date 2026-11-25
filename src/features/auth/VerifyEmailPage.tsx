import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useAuthApi } from '../../api/ApiContext';
import { LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { AuthCard } from './AuthCard';

type Status = 'verifying' | 'verified' | 'failed';

/** Landing page for the link in the verification email: /verify-email?token=… */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const api = useAuthApi();
  const token = useSearchParams()[0].get('token');
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'failed');
  // Tokens are single-use; make sure StrictMode's double effect can't spend it twice.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api.verifyEmail(token).then(
      () => setStatus('verified'),
      () => setStatus('failed'),
    );
  }, [api, token]);

  if (status === 'verifying') return <LoadingState label={t('auth.verify.verifying')} />;

  const ok = status === 'verified';
  return (
    <AuthCard title={ok ? t('auth.verify.successTitle') : t('auth.verify.failedTitle')}>
      <p role={ok ? 'status' : 'alert'}>{ok ? t('auth.verify.successBody') : t('auth.verify.failedBody')}</p>
      <Link to={paths.signIn} className="btn btn--primary">
        {t('auth.signIn.submit')}
      </Link>
    </AuthCard>
  );
}
