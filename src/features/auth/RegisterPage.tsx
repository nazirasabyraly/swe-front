import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuthApi } from '../../api/ApiContext';
import { AUTH_ERRORS, type AccountType } from '../../api/auth';
import { useDescribeError } from '../../api/errors';
import { ApiError } from '../../api/http';
import { homePathFor, useAuth } from '../../auth/AuthContext';
import { FormField } from '../../components/FormField';
import { paths } from '../../routes';
import { AuthCard } from './AuthCard';
import type { CheckEmailState } from './CheckEmailPage';
import { compact, confirmError, emailError, focusFirst, newPasswordError, type AuthFieldError } from './validation';

type Field = 'name' | 'email' | 'password' | 'confirm';
type Errors = Partial<Record<Field, AuthFieldError | 'auth.errors.emailTaken'>>;

const ACCOUNT_TYPES: AccountType[] = ['attendee', 'organizer'];

export function RegisterPage() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const api = useAuthApi();
  const navigate = useNavigate();
  const describeError = useDescribeError();
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' });
  const [accountType, setAccountType] = useState<AccountType>('attendee');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === 'authenticated') return <Navigate to={homePathFor(state.user)} replace />;

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  function showErrors(next: Errors) {
    setErrors(next);
    focusFirst(formRef.current, Object.keys(next).map((k) => `register-${k}`));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next = compact({
      name: values.name.trim() ? undefined : ('auth.errors.nameRequired' as const),
      email: emailError(values.email),
      password: newPasswordError(values.password),
      confirm: confirmError(values.password, values.confirm),
    });
    if (Object.keys(next).length) return showErrors(next);
    setErrors({});

    setSubmitting(true);
    try {
      const email = values.email.trim();
      await api.register({ name: values.name.trim(), email, password: values.password, accountType });
      const state: CheckEmailState = { email };
      navigate(paths.checkEmail, { state });
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.code === AUTH_ERRORS.emailTaken) {
        showErrors({ email: 'auth.errors.emailTaken' });
      } else if (err instanceof ApiError && err.code === AUTH_ERRORS.weakPassword) {
        showErrors({ password: 'auth.errors.passwordTooShort' });
      } else {
        setFormError(describeError(err));
      }
    }
  }

  const error = (field: Field) => (errors[field] ? t(errors[field]) : undefined);

  return (
    <AuthCard title={t('auth.register.title')} subtitle={t('auth.register.subtitle')}>
      {formError && (
        <div className="notice notice--danger form-summary" role="alert">
          {formError}
        </div>
      )}

      <form ref={formRef} className="auth-form" onSubmit={handleSubmit} noValidate>
        <fieldset className="field fieldset-reset">
          <legend className="field__label">{t('auth.register.accountType')}</legend>
          <div className="option-cards option-cards--two">
            {ACCOUNT_TYPES.map((type) => (
              <label key={type} className="option-card">
                <input
                  type="radio"
                  name="accountType"
                  value={type}
                  checked={accountType === type}
                  onChange={() => setAccountType(type)}
                />
                <span>
                  <span className="option-card__label">{t(`auth.register.${type}.label`)}</span>
                  <span className="option-card__description">{t(`auth.register.${type}.description`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <FormField id="register-name" label={t('auth.fields.name')} error={error('name')}>
          {(control) => (
            <input {...control} className="input" autoComplete="name" value={values.name} onChange={set('name')} />
          )}
        </FormField>
        <FormField id="register-email" label={t('auth.fields.email')} error={error('email')}>
          {(control) => (
            <input
              {...control}
              type="email"
              className="input"
              autoComplete="email"
              value={values.email}
              onChange={set('email')}
            />
          )}
        </FormField>
        <FormField
          id="register-password"
          label={t('auth.fields.password')}
          hint={t('auth.fields.passwordHint')}
          error={error('password')}
        >
          {(control) => (
            <input
              {...control}
              type="password"
              className="input"
              autoComplete="new-password"
              value={values.password}
              onChange={set('password')}
            />
          )}
        </FormField>
        <FormField id="register-confirm" label={t('auth.fields.confirmPassword')} error={error('confirm')}>
          {(control) => (
            <input
              {...control}
              type="password"
              className="input"
              autoComplete="new-password"
              value={values.confirm}
              onChange={set('confirm')}
            />
          )}
        </FormField>

        <button type="submit" className="btn btn--primary auth-form__submit" disabled={submitting}>
          {submitting ? t('auth.register.submitting') : t('auth.register.submit')}
        </button>
      </form>

      <p className="auth-card__footer">
        {t('auth.register.haveAccount')} <Link to={paths.signIn}>{t('auth.register.signInLink')}</Link>
      </p>
    </AuthCard>
  );
}
