import { useTranslation } from 'react-i18next';
import { useFormat } from '../i18n/useFormat';

interface MoneyProps {
  /** Amount in KZT, exactly as returned by the server. Never computed on the client. */
  amount: number;
  /** Show "Free" instead of "0 ₸". */
  freeWhenZero?: boolean;
  className?: string;
}

export function Money({ amount, freeWhenZero = false, className }: MoneyProps) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <span className={['money', className].filter(Boolean).join(' ')}>
      {freeWhenZero && amount === 0 ? t('common.free') : format.kzt(amount)}
    </span>
  );
}
