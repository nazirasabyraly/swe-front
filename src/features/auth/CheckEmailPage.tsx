import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useAuthApi } from '../../api/ApiContext';
import { USE_MOCKS } from '../../api/config';
import { useDescribeError } from '../../api/errors';
import { MockEmailLink } from '../../api/mocks/MockEmailLink';
import { paths } from '../../routes';
import { AuthCard } from './AuthCard';

export interface CheckEmailState {
  email?: string;
}

/** Shown after registration: "we sent you a verification link". */
export function CheckEmailPage() {
  const { t } = useTranslation();
  const api = useAuthApi();
  const describeError = useDescribeError();
  const email = (useLocation().state as CheckEmailState | null)?.email;
  const [resendCount, setResendCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    if (!email) return;
    setError(null);
    try {
      await api.resendVerification(email);
      setResendCount((n) => n + 1);
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <AuthCard title={t('auth.checkEmail.title')}>
      <p>{email ? t('auth.checkEmail.body', { email }) : t('auth.checkEmail.bodyNoEmail')}</p>
      {USE_MOCKS && email && <MockEmailLink key={resendCount} to={email} kind="verify-email" />}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {resendCount > 0 && <p role="status">{t('auth.signIn.resent')}</p>}
      <div className="auth-actions">
        {email && (
          <button type="button" className="btn" onClick={resend}>
            {t('auth.signIn.resend')}
          </button>
        )}
        <Link to={paths.signIn} className="btn btn--primary">
          {t('auth.backToSignIn')}
        </Link>
      </div>
    </AuthCard>
  );
}
