import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatDateTime,
  formatDateTimeRange,
  formatKZT,
  formatNumber,
  formatShortDate,
  formatTimeZoneName,
} from '../lib/format';
import { INTL_LOCALES, type Language } from '.';

/** Formatters bound to the current UI language. */
export function useFormat() {
  const { i18n } = useTranslation();
  const locale = INTL_LOCALES[i18n.language as Language] ?? INTL_LOCALES.en;
  return useMemo(
    () => ({
      locale,
      dateTime: (date: Date, timeZone?: string) => formatDateTime(date, locale, timeZone),
      dateTimeRange: (start: Date, end: Date, timeZone?: string) =>
        formatDateTimeRange(start, end, locale, timeZone),
      shortDate: (date: Date, timeZone?: string) => formatShortDate(date, locale, timeZone),
      timeZoneName: (date: Date, timeZone: string) => formatTimeZoneName(date, locale, timeZone),
      number: (n: number) => formatNumber(n, locale),
      kzt: (amount: number) => formatKZT(amount, locale),
    }),
    [locale],
  );
}
