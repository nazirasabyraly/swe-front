import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDescribeError } from '../../api/errors';
import { ApiError } from '../../api/http';
import { PROMO_ERRORS, type PromoErrorCode } from '../../api/publicEvents';

const PROMO_CODES = new Set<string>(Object.values(PROMO_ERRORS));

export const isPromoError = (err: unknown): err is ApiError & { code: PromoErrorCode } =>
  err instanceof ApiError && !!err.code && PROMO_CODES.has(err.code);

/** Our own translated text for promo rejections (SRS 4.14 "clear message"); the server's for anything else. */
export function useDescribePromoError() {
  const { t } = useTranslation();
  const describeError = useDescribeError();
  return useCallback(
    (err: unknown) => (isPromoError(err) ? t(`promo.errors.${err.code}`) : describeError(err)),
    [t, describeError],
  );
}
