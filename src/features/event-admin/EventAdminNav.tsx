import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { paths } from '../../routes';

/** Sub-navigation for one event's management pages. */
export function EventAdminNav({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const links = [
    { to: paths.organizerEvent(eventId), label: t('eventAdmin.nav.overview'), end: true },
    { to: paths.organizerEventOrders(eventId), label: t('eventAdmin.nav.orders') },
    { to: paths.organizerEventTickets(eventId), label: t('eventAdmin.nav.tickets') },
    { to: paths.organizerEventCampaigns(eventId), label: t('eventAdmin.nav.campaigns') },
    { to: paths.organizerEventPaidSales(eventId), label: t('eventAdmin.nav.paidSales') },
    { to: paths.organizerEventStaff(eventId), label: t('eventAdmin.nav.staff') },
    { to: paths.organizerEventTimeline(eventId), label: t('eventAdmin.nav.timeline') },
  ];
  return (
    <nav className="event-admin-nav" aria-label={t('eventAdmin.nav.label')}>
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.end}>
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
