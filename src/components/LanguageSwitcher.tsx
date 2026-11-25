import { useTranslation } from 'react-i18next';
import { LANGUAGE_NAMES, LANGUAGES, currentLanguage, setLanguage, type Language } from '../i18n';

export function LanguageSwitcher() {
  const { t } = useTranslation();
  return (
    <label className="language-switcher">
      <span className="sr-only">{t('nav.language')}</span>
      <select
        className="language-switcher__select"
        value={currentLanguage()}
        onChange={(e) => void setLanguage(e.target.value as Language)}
      >
        {LANGUAGES.map((lng) => (
          <option key={lng} value={lng} lang={lng}>
            {LANGUAGE_NAMES[lng]}
          </option>
        ))}
      </select>
    </label>
  );
}
