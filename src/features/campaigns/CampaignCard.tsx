import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Campaign, CampaignStatus } from '../../api/campaigns';
import type { TicketType } from '../../api/ticketTypes';
import { DateTimeText } from '../../components/DateTimeText';
import { Money } from '../../components/Money';
import { StatusBadge, type StatusTone } from '../../components/StatusBadge';
import { useFormat } from '../../i18n/useFormat';

const TONES: Record<CampaignStatus, StatusTone> = {
  active: 'success',
  scheduled: 'info',
  expired: 'neutral',
  exhausted: 'warning',
  disabled: 'neutral',
};

interface CampaignCardProps {
  campaign: Campaign;
  ticketTypes: TicketType[];
  timeZone: string;
  pending: boolean;
  error?: string;
  onToggleEnabled: () => void;
}

/** One promo campaign: its code, link and Campaign QR, plus the server's results (SRS 4.14). */
export function CampaignCard({ campaign, ticketTypes, timeZone, pending, error, onToggleEnabled }: CampaignCardProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const [copied, setCopied] = useState<'code' | 'link' | 'failed' | null>(null);
  const titleId = `campaign-${campaign.id}`;
  const { stats } = campaign;

  async function copy(what: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(what === 'code' ? campaign.code : campaign.link);
      setCopied(what);
    } catch {
      setCopied('failed');
    }
  }

  const discount =
    campaign.discountType === 'percent'
      ? t('campaigns.card.percentOff', { value: format.number(campaign.discountValue) })
      : t('campaigns.card.fixedOff', { value: format.kzt(campaign.discountValue) });
  const appliesTo =
    campaign.ticketTypeIds.length === 0
      ? t('campaigns.card.allTypes')
      : campaign.ticketTypeIds
          .map((id) => ticketTypes.find((type) => type.id === id)?.name ?? t('campaigns.card.deletedType'))
          .join(', ');

  return (
    <li className="panel campaign" aria-labelledby={titleId}>
      <div className="campaign__head">
        <div>
          <h3 id={titleId} className="ticket-row__title">
            {campaign.name}
          </h3>
          <p className="label-muted">
            {discount} · {appliesTo}
          </p>
        </div>
        <StatusBadge tone={TONES[campaign.status]}>{t(`campaigns.status.${campaign.status}`)}</StatusBadge>
      </div>

      <div className="campaign__body">
        <div className="campaign__share">
          <p className="campaign__label">{t('campaigns.card.code')}</p>
          <div className="campaign__copy-row">
            <code className="campaign__code">{campaign.code}</code>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => copy('code')}
              aria-label={t('campaigns.card.copyCodeLabel', { code: campaign.code })}
            >
              {t('campaigns.card.copy')}
            </button>
          </div>

          <p className="campaign__label">{t('campaigns.card.link')}</p>
          <div className="campaign__copy-row">
            <input
              className="input campaign__link"
              readOnly
              value={campaign.link}
              aria-label={t('campaigns.card.linkLabel', { name: campaign.name })}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className="btn btn--small"
              onClick={() => copy('link')}
              aria-label={t('campaigns.card.copyLinkLabel', { name: campaign.name })}
            >
              {t('campaigns.card.copy')}
            </button>
          </div>
          <p className="label-muted campaign__copied" role="status">
            {copied === 'code' && t('campaigns.card.codeCopied')}
            {copied === 'link' && t('campaigns.card.linkCopied')}
            {copied === 'failed' && t('campaigns.card.copyFailed')}
          </p>

          <dl className="campaign__facts">
            <div>
              <dt>{t('campaigns.card.valid')}</dt>
              <dd>
                <DateTimeText value={campaign.validFrom} timeZone={timeZone} /> →{' '}
                <DateTimeText value={campaign.validUntil} timeZone={timeZone} />
              </dd>
            </div>
            <div>
              <dt>{t('campaigns.card.redemptions')}</dt>
              <dd>
                {campaign.maxRedemptions === null
                  ? t('campaigns.card.redemptionsUnlimited', { used: format.number(stats.redemptions) })
                  : t('campaigns.card.redemptionsOf', {
                      used: format.number(stats.redemptions),
                      max: format.number(campaign.maxRedemptions),
                    })}
              </dd>
            </div>
          </dl>
        </div>

        {/* Deliberately unlike an admission ticket's QR (SRS 4.14): dashed frame, promo label. */}
        <figure className="campaign-qr">
          <figcaption className="campaign-qr__label">{t('campaigns.qr.label')}</figcaption>
          <img
            src={campaign.qrImageUrl}
            alt={t('campaigns.qr.alt', { code: campaign.code })}
            width={160}
            height={160}
          />
          <p className="campaign-qr__note">{t('campaigns.qr.notATicket')}</p>
          <a
            className="btn btn--small"
            href={campaign.qrDownloadUrl}
            download={`biletflow-campaign-${campaign.code}.svg`}
            aria-label={t('campaigns.qr.downloadLabel', { code: campaign.code })}
          >
            {t('campaigns.qr.download')}
          </a>
        </figure>
      </div>

      <dl className="ticket-row__counters" aria-label={t('campaigns.card.statsLabel', { name: campaign.name })}>
        <div>
          <dt>{t('campaigns.stats.orders')}</dt>
          <dd>{format.number(stats.orders)}</dd>
        </div>
        <div>
          <dt>{t('campaigns.stats.ticketsSold')}</dt>
          <dd>{format.number(stats.ticketsSold)}</dd>
        </div>
        <div>
          <dt>{t('campaigns.stats.gross')}</dt>
          <dd>
            <Money amount={stats.grossRevenue} />
          </dd>
        </div>
        <div>
          <dt>{t('campaigns.stats.discount')}</dt>
          <dd>
            <Money amount={stats.discountTotal} />
          </dd>
        </div>
        <div>
          <dt>{t('campaigns.stats.net')}</dt>
          <dd>
            <Money amount={stats.netRevenue} />
          </dd>
        </div>
      </dl>

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <div className="ticket-row__actions">
        <button
          type="button"
          className="btn btn--small"
          onClick={onToggleEnabled}
          disabled={pending}
          aria-label={t(campaign.enabled ? 'campaigns.actions.disableLabel' : 'campaigns.actions.enableLabel', {
            name: campaign.name,
          })}
        >
          {campaign.enabled ? t('campaigns.actions.disable') : t('campaigns.actions.enable')}
        </button>
      </div>
    </li>
  );
}
