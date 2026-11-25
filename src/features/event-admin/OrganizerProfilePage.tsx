import './event-admin.css';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useOrganizerApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import type { OrganizerProfile } from '../../api/organizer';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { FormField } from '../../components/FormField';
import { StatusBadge } from '../../components/StatusBadge';
import { paths } from '../../routes';
import { validatePayout } from '../paid-sales/validation';
import { useLoad } from '../orders/useLoad';

type Field = 'organizationName' | 'contactEmail' | 'contactPhone' | 'website' | 'about';

/** `/organizer/profile`: contact and payout information (SRS 4.1). */
export function OrganizerProfilePage() {
  const { t } = useTranslation();
  const api = useOrganizerApi();
  const { state, reload } = useLoad(() => api.getProfile(), [api]);
  if (state.status === 'loading') return <LoadingState label={t('profile.loading')} />;
  if (state.status === 'error') return <ErrorState title={t('profile.loadError')} message={state.message} onRetry={reload} />;
  return <ProfileForm initial={state.data} />;
}

function ProfileForm({ initial }: { initial: OrganizerProfile }) {
  const { t } = useTranslation();
  const api = useOrganizerApi();
  const describeError = useDescribeError();
  const [profile, setProfile] = useState(initial);
  const [values, setValues] = useState<Record<Field, string>>(initial);
  const [changePayout, setChangePayout] = useState(false);
  const [holder, setHolder] = useState('');
  const [iban, setIban] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field | 'holder' | 'iban', string>>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setValues(profile), [profile]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const found: typeof errors = {};
    if (!values.organizationName.trim()) found.organizationName = t('profile.required');
    if (!/^\S+@\S+\.\S+$/.test(values.contactEmail.trim())) found.contactEmail = t('staff.emailInvalid');
    if (values.website && !/^https?:\/\/\S+$/.test(values.website.trim())) found.website = t('profile.websiteInvalid');
    if (changePayout) {
      const p = validatePayout({ accountHolder: holder, iban });
      if (p.accountHolder) found.holder = t(p.accountHolder);
      if (p.iban) found.iban = t(p.iban);
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setStatus(null);
    try {
      const saved = await api.updateProfile({
        organizationName: values.organizationName.trim(),
        contactEmail: values.contactEmail.trim(),
        contactPhone: values.contactPhone.trim(),
        website: values.website.trim(),
        about: values.about.trim(),
        payout: changePayout ? { accountHolder: holder.trim(), iban: iban.replace(/\s/g, '').toUpperCase() } : undefined,
      });
      setProfile(saved);
      setChangePayout(false);
      setHolder('');
      setIban('');
      setStatus({ ok: true, text: t('profile.saved') });
    } catch (err) {
      setStatus({ ok: false, text: describeError(err) });
    } finally {
      setSaving(false);
    }
  }

  const field = (name: Field, label: string, type = 'text') => (
    <FormField id={`profile-${name}`} label={label} error={errors[name]}>
      {(control) => <input {...control} type={type} className="input" value={values[name]} onChange={(e) => setValues({ ...values, [name]: e.target.value })} />}
    </FormField>
  );

  return (
    <div className="profile-page">
      <h1 className="section-title">{t('profile.title')}</h1>
      <p className="section-subtitle">{t('profile.subtitle')}</p>
      <form className="card" onSubmit={save} noValidate aria-label={t('profile.title')}>
        <h2 className="card__title">{t('profile.contact')}</h2>
        <div className="form-grid">
          {field('organizationName', t('profile.organizationName'))}
          {field('contactEmail', t('profile.contactEmail'), 'email')}
          {field('contactPhone', t('profile.contactPhone'), 'tel')}
          {field('website', t('profile.website'), 'url')}
          <FormField id="profile-about" label={t('profile.about')} className="form-grid--full">
            {(control) => <textarea {...control} className="input" rows={3} value={values.about} onChange={(e) => setValues({ ...values, about: e.target.value })} />}
          </FormField>
        </div>

        <h2 className="card__title profile__payout-title">{t('profile.payout')}</h2>
        <p>
          <StatusBadge tone={profile.payout.status === 'verified' ? 'success' : profile.payout.status === 'pending' ? 'warning' : 'neutral'}>
            {t(`profile.payoutStatus.${profile.payout.status}`)}
          </StatusBadge>{' '}
          {profile.payout.ibanLast4 && t('profile.payoutAccount', { holder: profile.payout.accountHolder, last4: profile.payout.ibanLast4 })}
        </p>
        {profile.payout.simulated && <p className="sim-note">{t('profile.payoutSimulated')}</p>}
        <label className="checkbox-row profile__change">
          <input type="checkbox" checked={changePayout} onChange={(e) => setChangePayout(e.target.checked)} />
          {t('profile.changePayout')}
        </label>
        {changePayout && (
          <div className="form-grid">
            <FormField id="profile-holder" label={t('paidSales.payout.accountHolder')} error={errors.holder}>
              {(control) => <input {...control} className="input" value={holder} onChange={(e) => setHolder(e.target.value)} />}
            </FormField>
            <FormField id="profile-iban" label={t('paidSales.payout.iban')} hint={t('paidSales.payout.ibanHint')} error={errors.iban}>
              {(control) => <input {...control} className="input" value={iban} onChange={(e) => setIban(e.target.value)} />}
            </FormField>
          </div>
        )}

        {status && (
          <p className={status.ok ? 'notice' : 'notice notice--danger'} role={status.ok ? 'status' : 'alert'}>
            {status.text}
          </p>
        )}
        <div className="form-actions">
          <Link to={paths.newSupportCase({ kind: 'organizer' })} className="btn">{t('support.contactPlatform')}</Link>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? t('common.working') : t('profile.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
