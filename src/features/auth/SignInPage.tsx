import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useAuthApi } from '../../api/ApiContext';
import { AUTH_ERRORS } from '../../api/auth';
import { USE_MOCKS } from '../../api/config';
import { useDescribeError } from '../../api/errors';
import { ApiError } from '../../api/http';
import { MockEmailLink } from '../../api/mocks/MockEmailLink';
import { MOCK_EMAILS, MOCK_PASSWORD } from '../../api/mocks/mockAuth';
import { homePathFor, useAuth } from '../../auth/AuthContext';
import { FormField } from '../../components/FormField';
import { paths, safeNextPath } from '../../routes';
import { AuthCard } from './AuthCard';
import { compact, emailError, focusFirst, type AuthFieldError } from './validation';

export function SignInPage() {
  const { t } = useTranslation();
  const { state, signIn } = useAuth();
  const authApi = useAuthApi();
  const describeError = useDescribeError();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const formRef = useRef<HTMLFormElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: AuthFieldError; password?: AuthFieldError }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Also handles the redirect right after a successful sign-in.
  if (state.status === 'authenticated') {
    return <Navigate to={next ?? homePathFor(state.user)} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors = compact({
      email: emailError(email),
      password: password ? undefined : ('auth.errors.passwordRequired' as const),
    });
    setErrors(nextErrors);
    setFormError(null);
    setUnverified(false);
    if (Object.keys(nextErrors).length) {
      focusFirst(formRef.current, Object.keys(nextErrors).map((k) => `signin-${k}`));
      return;
    }

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.code === AUTH_ERRORS.invalidCredentials) {
        setFormError(t('auth.errors.invalidCredentials'));
      } else if (err instanceof ApiError && err.code === AUTH_ERRORS.emailNotVerified) {
        setUnverified(true);
      } else {
        setFormError(describeError(err));
      }
    }
  }

  async function resend() {
    try {
      await authApi.resendVerification(email.trim());
      setResent(true);
    } catch (err) {
      setFormError(describeError(err));
    }
  }

  return (
    <AuthCard title={t('auth.signIn.title')} subtitle={t('auth.signIn.subtitle')}>
      {USE_MOCKS && (
        <p className="mock-banner">
          {t('auth.signIn.mockAccounts', { password: MOCK_PASSWORD })} {MOCK_EMAILS.join(', ')}
        </p>
      )}

      {formError && (
        <div className="notice notice--danger form-summary" role="alert">
          {formError}
        </div>
      )}

      {unverified && (
        <div className="notice form-summary" role="alert">
          <strong>{t('auth.signIn.unverifiedTitle')}</strong>
          <p className="notice__body">{t('auth.signIn.unverifiedBody', { email: email.trim() })}</p>
          {resent ? (
            <p role="status">{t('auth.signIn.resent')}</p>
          ) : (
            <button type="button" className="btn" onClick={resend}>
              {t('auth.signIn.resend')}
            </button>
          )}
          {USE_MOCKS && resent && <MockEmailLink to={email} kind="verify-email" />}
        </div>
      )}

      <form ref={formRef} className="auth-form" onSubmit={handleSubmit} noValidate>
        <FormField id="signin-email" label={t('auth.fields.email')} error={errors.email && t(errors.email)}>
          {(control) => (
            <input
              {...control}
              type="email"
              className="input"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </FormField>
        <FormField
          id="signin-password"
          label={t('auth.fields.password')}
          error={errors.password && t(errors.password)}
        >
          {(control) => (
            <input
              {...control}
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </FormField>
        <Link to={paths.forgotPassword} className="auth-form__aside">
          {t('auth.signIn.forgot')}
        </Link>
        <button type="submit" className="btn btn--primary auth-form__submit" disabled={submitting}>
          {submitting ? t('auth.signIn.submitting') : t('auth.signIn.submit')}
        </button>
      </form>

      <p className="auth-card__footer">
        {t('auth.signIn.noAccount')} <Link to={paths.register}>{t('auth.signIn.registerLink')}</Link>
      </p>
    </AuthCard>
  );
}
