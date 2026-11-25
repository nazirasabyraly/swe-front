import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useCheckoutApi } from '../../api/ApiContext';
import { LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { useDescribePromoError } from '../public-events/promoErrors';
import { parseItems } from './selection';

/**
 * `/events/:id/checkout?items=…&promo=…`: holds the selected tickets, then replaces itself with
 * `/checkout/:reservationId` so a reload resumes the same hold instead of creating another.
 */
export function CheckoutStartPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const api = useCheckoutApi();
  const navigate = useNavigate();
  const describeError = useDescribePromoError();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false); // React StrictMode runs effects twice in development

  const items = parseItems(params.get('items'));
  const promo = params.get('promo');

  useEffect(() => {
    if (!items || started.current) return;
    started.current = true;
    api.createReservation(id, items, promo).then(
      (reservation) => navigate(paths.checkout(reservation.id), { replace: true }),
      (err: unknown) => setError(describeError(err)),
    );
  }, [api, id, items, promo, navigate, describeError]);

  if (items && !error) return <LoadingState label={t('checkout.holding')} />;

  return (
    <section className="card empty-state">
      <h1 className="card__title">{t('checkout.startFailedTitle')}</h1>
      <p className="label-muted" role="alert">
        {error ?? t('checkout.invalidSelection')}
      </p>
      <Link to={paths.publicEvent(id)} className="btn btn--primary">
        {t('checkout.backToEvent')}
      </Link>
    </section>
  );
}
