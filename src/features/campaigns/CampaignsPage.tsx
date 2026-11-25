import '../ticket-types/ticket-types.css';
import './campaigns.css';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useCampaignsApi } from '../../api/ApiContext';
import type { Campaign, CampaignInput } from '../../api/campaigns';
import { useDescribeError } from '../../api/errors';
import type { OrganizerEvent } from '../../api/events';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { EventAdminNav } from '../event-admin/EventAdminNav';
import '../event-admin/event-admin.css';
import { useOrganizerEvent } from '../event-setup/useOrganizerEvent';
import { useTicketTypes } from '../ticket-types/useTicketTypes';
import { CampaignCard } from './CampaignCard';
import { CampaignForm } from './CampaignForm';
import { newCampaignDraft } from './model';

/** Promo campaigns for one event: create, share (code, link, QR), enable/disable, results. */
export function CampaignsPage({ now = () => new Date() }: { now?: () => Date }) {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { state, reload } = useOrganizerEvent(id);

  return (
    <div>
      <Link to={paths.organizerEvents} className="back-link">
        {t('editEvent.back')}
      </Link>
      {state.status === 'loading' && <LoadingState label={t('eventSetup.loading')} />}
      {state.status === 'error' && <ErrorState title={t('eventSetup.loadError')} message={state.message} onRetry={reload} />}
      {state.status === 'ready' && (
        <>
          <h1 className="section-title ticket-page__title">{t('campaigns.pageTitle', { title: state.event.title })}</h1>
          <EventAdminNav eventId={state.event.id} />
          <CampaignsManager event={state.event} now={now} />
        </>
      )}
    </div>
  );
}

type ListState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; campaigns: Campaign[] };

function useCampaigns(eventId: string) {
  const api = useCampaignsApi();
  const describeError = useDescribeError();
  const [state, setState] = useState<ListState>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api.listCampaigns(eventId).then(
      (campaigns) => !cancelled && setState({ status: 'ready', campaigns }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: describeError(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, eventId, describeError]);
  useEffect(load, [load]);

  const upsert = (campaign: Campaign) =>
    setState((s) =>
      s.status !== 'ready'
        ? s
        : {
            ...s,
            campaigns: s.campaigns.some((c) => c.id === campaign.id)
              ? s.campaigns.map((c) => (c.id === campaign.id ? campaign : c))
              : [campaign, ...s.campaigns],
          },
    );
  return { state, reload: load, upsert };
}

function CampaignsManager({ event, now }: { event: OrganizerEvent; now: () => Date }) {
  const { t } = useTranslation();
  const api = useCampaignsApi();
  const describeError = useDescribeError();
  const { state, reload, upsert } = useCampaigns(event.id);
  const { state: typesState } = useTicketTypes(event.id);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  async function save(input: CampaignInput) {
    setFormError(null);
    try {
      upsert(await api.createCampaign(event.id, input));
      setAdding(false);
    } catch (err) {
      setFormError(describeError(err));
    }
  }

  async function toggle(campaign: Campaign) {
    setPendingId(campaign.id);
    setRowErrors(({ [campaign.id]: _cleared, ...rest }) => rest);
    try {
      upsert(await api.setCampaignEnabled(event.id, campaign.id, !campaign.enabled));
    } catch (err) {
      setRowErrors((e) => ({ ...e, [campaign.id]: describeError(err) }));
    } finally {
      setPendingId(null);
    }
  }

  if (state.status === 'loading' || typesState.status === 'loading') return <LoadingState label={t('campaigns.loading')} />;
  if (state.status === 'error') return <ErrorState title={t('campaigns.loadError')} message={state.message} onRetry={reload} />;
  const ticketTypes = typesState.status === 'ready' ? typesState.types : [];

  return (
    <section className="card" aria-labelledby="campaigns-heading">
      <div className="ticket-types__header">
        <div>
          <h2 id="campaigns-heading" className="card__title">
            {t('campaigns.title')}
          </h2>
          <p className="label-muted ticket-types__subtitle">{t('campaigns.subtitle')}</p>
        </div>
        {!adding && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setFormError(null);
              setAdding(true);
            }}
          >
            {t('campaigns.add')}
          </button>
        )}
      </div>

      {event.status !== 'published' && (
        <p className="notice ticket-types__notice" role="note">
          {t('campaigns.unpublishedNotice')}
        </p>
      )}

      {adding && (
        <CampaignForm
          initialDraft={newCampaignDraft(event, now())}
          timeZone={event.timeZone}
          eventEndsAt={event.endsAt}
          ticketTypes={ticketTypes}
          onSave={save}
          onCancel={() => setAdding(false)}
          serverError={formError}
        />
      )}

      {state.campaigns.length === 0 && !adding && (
        <EmptyState headingLevel={3} title={t('campaigns.emptyTitle')} description={t('campaigns.emptyBody')} />
      )}

      {state.campaigns.length > 0 && (
        <ul className="ticket-types__list">
          {state.campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              ticketTypes={ticketTypes}
              timeZone={event.timeZone}
              pending={pendingId === campaign.id}
              error={rowErrors[campaign.id]}
              onToggleEnabled={() => toggle(campaign)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
