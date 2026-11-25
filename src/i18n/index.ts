import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import kk from './locales/kk.json';
import ru from './locales/ru.json';

export const LANGUAGES = ['kk', 'ru', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Native names, shown as-is in every UI language. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  kk: 'Қазақша',
  ru: 'Русский',
  en: 'English',
};

/** Used when neither a saved choice nor the browser language matches. */
export const DEFAULT_LANGUAGE: Language = 'ru';

/** BCP 47 locale for Intl formatting. en-GB keeps the prototype's day-month order. */
export const INTL_LOCALES: Record<Language, string> = {
  kk: 'kk-KZ',
  ru: 'ru-RU',
  en: 'en-GB',
};

const STORAGE_KEY = 'biletflow.language';

const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies).
  }
  const browser = (navigator.languages ?? [navigator.language])
    .map((tag) => tag.slice(0, 2).toLowerCase())
    .find(isLanguage);
  return browser ?? DEFAULT_LANGUAGE;
}

export function setLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not persisted; the choice still applies for this session.
  }
  return i18n.changeLanguage(language);
}

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru }, kk: { translation: kk } },
  lng: detectLanguage(),
  // English is the complete base file; a missing kk/ru key falls back to it.
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  interpolation: { escapeValue: false }, // React already escapes output.
  initAsync: false,
  returnNull: false,
});

document.documentElement.lang = i18n.language;

export default i18n;
