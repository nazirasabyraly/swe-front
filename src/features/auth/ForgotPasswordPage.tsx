import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuthApi } from '../../api/ApiContext';
import { USE_MOCKS } from '../../api/config';
import { useDescribeError } from '../../api/errors';
import { MockEmailLink } from '../../api/mocks/MockEmailLink';
import { FormField } from '../../components/FormField';
import { paths } from '../../routes';
import { AuthCard } from './AuthCard';
import { emailError, type AuthFieldError } from './validation';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const api = useAuthApi();
  const describeError = useDescribeError();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<AuthFieldError | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const fieldError = emailError(email);
    setError(fieldError);
    setFormError(null);
    if (fieldError) {
      inputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await api.requestPasswordReset(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setFormError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <AuthCard title={t('auth.forgot.sentTitle')}>
        <p role="status">{t('auth.forgot.sentBody', { email: sentTo })}</p>
        {USE_MOCKS && <MockEmailLink to={sentTo} kind="reset-password" />}
        <Link to={paths.signIn} className="btn btn--primary">
          {t('auth.backToSignIn')}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')}>
      {formError && (
        <div className="notice notice--danger form-summary" role="alert">
          {formError}
        </div>
      )}
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <FormField id="forgot-email" label={t('auth.fields.email')} error={error && t(error)}>
          {(control) => (
            <input
              {...control}
              ref={inputRef}
              type="email"
              className="input"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </FormField>
        <button type="submit" className="btn btn--primary auth-form__submit" disabled={submitting}>
          {submitting ? t('auth.forgot.submitting') : t('auth.forgot.submit')}
        </button>
      </form>
      <p className="auth-card__footer">
        <Link to={paths.signIn}>{t('auth.backToSignIn')}</Link>
      </p>
    </AuthCard>
  );
}
