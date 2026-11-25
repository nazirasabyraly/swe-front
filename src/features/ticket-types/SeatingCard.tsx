import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSeatingApi, useTicketTypesApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import type { SeatingConfig, VenueLayout } from '../../api/seating';
import type { TicketType } from '../../api/ticketTypes';

/** General admission or assigned seating with a predefined layout (SRS 4.3.1; no visual editor required). */
export function SeatingCard({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const api = useSeatingApi();
  const ticketTypesApi = useTicketTypesApi();
  const describeError = useDescribeError();
  const [layouts, setLayouts] = useState<VenueLayout[]>([]);
  const [types, setTypes] = useState<TicketType[]>([]);
  const [config, setConfig] = useState<SeatingConfig | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    Promise.all([api.listLayouts(), api.getSeating(eventId), ticketTypesApi.listTicketTypes(eventId)]).then(
      ([l, c, tt]) => {
        setLayouts(l);
        setConfig(c);
        setTypes(tt);
      },
      (err: unknown) => setMessage({ ok: false, text: describeError(err) }),
    );
  }, [api, ticketTypesApi, eventId, describeError]);

  if (!config) return message ? <p className="field__error" role="alert">{message.text}</p> : null;
  const layout = layouts.find((l) => l.id === config.layoutId);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      setConfig(await api.updateSeating(eventId, config!));
      setMessage({ ok: true, text: t('seating.saved') });
    } catch (err) {
      setMessage({ ok: false, text: describeError(err) });
    }
  }

  return (
    <form className="card" onSubmit={save} aria-labelledby="seating-heading">
      <h2 id="seating-heading" className="card__title">{t('seating.title')}</h2>
      <fieldset className="fieldset-reset field">
        <legend className="field__label">{t('seating.mode')}</legend>
        <div className="chip-group">
          {(['general_admission', 'assigned'] as const).map((mode) => (
            <label key={mode} className="chip">
              <input
                type="radio"
                name="seating-mode"
                checked={config.mode === mode}
                onChange={() => setConfig({ ...config, mode, layoutId: mode === 'assigned' ? (config.layoutId ?? layouts[0]?.id ?? null) : null })}
              />
              {t(`seating.modes.${mode}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {config.mode === 'assigned' && (
        <>
          <div className="field">
            <label className="field__label" htmlFor="seating-layout">{t('seating.layout')}</label>
            <select id="seating-layout" className="input" value={config.layoutId ?? ''} onChange={(e) => setConfig({ ...config, layoutId: e.target.value })}>
              {layouts.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {layout && <span className="field__hint">{layout.description}</span>}
          </div>
          {layout?.categories.map((c) => (
            <div className="field" key={c.id}>
              <label className="field__label" htmlFor={`seating-cat-${c.id}`}>{t('seating.categoryTicketType', { category: c.label })}</label>
              <select
                id={`seating-cat-${c.id}`}
                className="input"
                value={config.categoryTicketTypes[c.id] ?? ''}
                onChange={(e) => setConfig({ ...config, categoryTicketTypes: { ...config.categoryTicketTypes, [c.id]: e.target.value } })}
              >
                <option value="">{t('seating.notSold')}</option>
                {types.map((tt) => (
                  <option key={tt.id} value={tt.id}>{tt.name}</option>
                ))}
              </select>
            </div>
          ))}
        </>
      )}
      {message && <p className={message.ok ? 'notice' : 'notice notice--danger'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn--primary">{t('seating.save')}</button>
      </div>
    </form>
  );
}
