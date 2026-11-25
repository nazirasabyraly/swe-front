import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { OrganizerEvent } from '../../api/events';
import type { TicketType } from '../../api/ticketTypes';
import { paths } from '../../routes';
import { TicketTypesManager } from '../ticket-types/TicketTypesManager';
import { SetupLayout } from './SetupLayout';

/** Wizard step 2. */
export function SetupTicketsPage({ now }: { now?: () => Date }) {
  return <SetupLayout step="tickets">{(event) => <TicketsStep event={event} now={now} />}</SetupLayout>;
}

function TicketsStep({ event, now }: { event: OrganizerEvent; now?: () => Date }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [visibleCount, setVisibleCount] = useState(0);
  const [hasPaid, setHasPaid] = useState(false);
  const onTypesChange = useCallback((types: TicketType[]) => {
    setVisibleCount(types.filter((type) => !type.hidden).length);
    setHasPaid(types.some((type) => type.kind === 'paid'));
  }, []);
  const canContinue = visibleCount > 0;

  return (
    <>
      <TicketTypesManager
        event={event}
        now={now}
        onTypesChange={onTypesChange}
        activationHref={paths.organizerEventSetup(event.id, 'activation')}
      />
      <div className="form-actions setup-actions">
        <Link to={paths.organizerEventSetup(event.id, 'details')} className="btn">
          {t('eventSetup.backToDetails')}
        </Link>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!canContinue}
          aria-describedby={canContinue ? undefined : 'setup-tickets-hint'}
          // Step 3 is only needed when there's something to activate.
          onClick={() => navigate(paths.organizerEventSetup(event.id, hasPaid ? 'activation' : 'review'))}
        >
          {hasPaid ? t('eventSetup.continueToActivation') : t('eventSetup.continueToReview')}
        </button>
      </div>
      {!canContinue && (
        <p id="setup-tickets-hint" className="label-muted setup-hint">
          {t('eventSetup.needTicketType')}
        </p>
      )}
    </>
  );
}
