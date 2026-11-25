import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import type { OrganizerEvent } from '../../api/events';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { SetupSteps, type SetupStep } from './SetupSteps';
import { useOrganizerEvent } from './useOrganizerEvent';

/** Loads the draft named in the URL and renders a wizard step around it. */
export function SetupLayout({ step, children }: { step: SetupStep; children: (event: OrganizerEvent) => ReactNode }) {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { state, reload } = useOrganizerEvent(id);

  return (
    <div>
      <h1 className="section-title">
        {state.status === 'ready' ? t('eventSetup.setupTitle', { title: state.event.title }) : t('createEvent.title')}
      </h1>
      <p className="section-subtitle">{t('createEvent.subtitle')}</p>
      <SetupSteps active={step} />
      {state.status === 'loading' && <LoadingState label={t('eventSetup.loading')} />}
      {state.status === 'error' && (
        <ErrorState title={t('eventSetup.loadError')} message={state.message} onRetry={reload} />
      )}
      {state.status === 'ready' && children(state.event)}
    </div>
  );
}
