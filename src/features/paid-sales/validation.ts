import type en from '../../i18n/locales/en.json';

export type PaidSalesValidationKey = `paidSales.validation.${keyof (typeof en)['paidSales']['validation']}`;

const IIN = /^\d{12}$/;
/** Kazakhstan IBAN: KZ, 2 check digits, 16 alphanumerics (20 characters). */
const KZ_IBAN = /^KZ\d{2}[A-Z0-9]{16}$/;

export function validateIdentity({ fullName, iin }: { fullName: string; iin: string }) {
  const errors: Partial<Record<'fullName' | 'iin', PaidSalesValidationKey>> = {};
  if (!fullName.trim()) errors.fullName = 'paidSales.validation.nameRequired';
  if (!iin.trim()) errors.iin = 'paidSales.validation.iinRequired';
  else if (!IIN.test(iin.trim())) errors.iin = 'paidSales.validation.iinInvalid';
  return errors;
}

export function validatePayout({ accountHolder, iban }: { accountHolder: string; iban: string }) {
  const errors: Partial<Record<'accountHolder' | 'iban', PaidSalesValidationKey>> = {};
  if (!accountHolder.trim()) errors.accountHolder = 'paidSales.validation.nameRequired';
  const normalised = iban.replace(/\s/g, '').toUpperCase();
  if (!normalised) errors.iban = 'paidSales.validation.ibanRequired';
  else if (!KZ_IBAN.test(normalised)) errors.iban = 'paidSales.validation.ibanInvalid';
  return errors;
}
