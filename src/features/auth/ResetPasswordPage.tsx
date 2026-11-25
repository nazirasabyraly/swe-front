import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useAuthApi } from '../../api/ApiContext';
import { AUTH_ERRORS } from '../../api/auth';
import { useDescribeError } from '../../api/errors';
import { ApiError } from '../../api/http';
import { FormField } from '../../components/FormField';
import { paths } from '../../routes';
import { AuthCard } from './AuthCard';
import { compact, confirmError, focusFirst, newPasswordError, type AuthFieldError } from './validation';

type Status = 'form' | 'done' | 'invalid';

/** Landing page for the link in the reset email: /reset-password?token=… */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const api = useAuthApi();
  const describeError = useDescribeError();
  const token = useSearchParams()[0].get('token');
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<Status>(token ? 'form' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: AuthFieldError; confirm?: AuthFieldError }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next = compact({ password: newPasswordError(password), confirm: confirmError(password, confirm) });
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirst(formRef.current, Object.keys(next).map((k) => `reset-${k}`));
      return;
    }
    setSubmitting(true);
    try {
      await api.resetPassword(token ?? '', password);
      setStatus('done');
    } catch (err) {
      if (err instanceof ApiError && err.code === AUTH_ERRORS.invalidToken) setStatus('invalid');
      else if (err instanceof ApiError && err.code === AUTH_ERRORS.weakPassword)
        setErrors({ password: 'auth.errors.passwordTooShort' });
      else setFormError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'invalid') {
    return (
      <AuthCard title={t('auth.reset.invalidTitle')}>
        <p role="alert">{t('auth.reset.invalidBody')}</p>
        <Link to={paths.forgotPassword} className="btn btn--primary">
          {t('auth.reset.requestNew')}
        </Link>
      </AuthCard>
    );
  }

  if (status === 'done') {
    return (
      <AuthCard title={t('auth.reset.successTitle')}>
        <p role="status">{t('auth.reset.successBody')}</p>
        <Link to={paths.signIn} className="btn btn--primary">
          {t('auth.signIn.submit')}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('auth.reset.title')}>
      {formError && (
        <div className="notice notice--danger form-summary" role="alert">
          {formError}
        </div>
      )}
      <form ref={formRef} className="auth-form" onSubmit={handleSubmit} noValidate>
        <FormField
          id="reset-password"
          label={t('auth.reset.password')}
          hint={t('auth.fields.passwordHint')}
          error={errors.password && t(errors.password)}
        >
          {(control) => (
            <input
              {...control}
              type="password"
              className="input"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </FormField>
        <FormField id="reset-confirm" label={t('auth.reset.confirm')} error={errors.confirm && t(errors.confirm)}>
          {(control) => (
            <input
              {...control}
              type="password"
              className="input"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </FormField>
        <button type="submit" className="btn btn--primary auth-form__submit" disabled={submitting}>
          {submitting ? t('auth.reset.submitting') : t('auth.reset.submit')}
        </button>
      </form>
    </AuthCard>
  );
}
