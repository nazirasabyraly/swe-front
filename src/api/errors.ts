import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from './http';

/** Turns any thrown value into a message for the current UI language. */
export function useDescribeError() {
  const { t } = useTranslation();
  return useCallback(
    (err: unknown): string => {
      if (err instanceof ApiError) {
        if (err.status === 0) return t('common.networkError');
        return err.serverMessage ?? t('common.requestFailed', { status: err.status });
      }
      if (err instanceof Error && err.message) return err.message;
      return t('common.genericError');
    },
    [t],
  );
}
