import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router';
import { USE_MOCKS } from './api/config';
import { hasRole, useAuth } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { NotificationsMenu } from './components/NotificationsMenu';
import { AccountPage } from './features/auth/AccountPage';
import { CheckEmailPage } from './features/auth/CheckEmailPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { SignInPage } from './features/auth/SignInPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { DiscoverPage } from './features/public-events/DiscoverPage';
import { PublicEventPage } from './features/public-events/PublicEventPage';
import { paths } from './routes';
import { RouteFocus } from './components/RouteFocus';
import { LoadingState } from './components/DataStates';
// Organizer, admin, checkout and account areas load on first visit, keeping the public bundle small.
const AdminActivationsPage = lazy(() => import('./features/admin/AdminPages').then((mod) => ({ default: mod.AdminActivationsPage })));
const AdminEventsPage = lazy(() => import('./features/admin/AdminPages').then((mod) => ({ default: mod.AdminEventsPage })));
const AdminPaymentsPage = lazy(() => import('./features/admin/AdminPages').then((mod) => ({ default: mod.AdminPaymentsPage })));
const AdminPromosPage = lazy(() => import('./features/admin/AdminPages').then((mod) => ({ default: mod.AdminPromosPage })));
const AdminReportsPage = lazy(() => import('./features/admin/AdminPages').then((mod) => ({ default: mod.AdminReportsPage })));
const AdminSearchPage = lazy(() => import('./features/admin/AdminPages').then((mod) => ({ default: mod.AdminSearchPage })));
const AdminSettingsPage = lazy(() => import('./features/admin/AdminPages').then((mod) => ({ default: mod.AdminSettingsPage })));
const EditEventPage = lazy(() => import('./features/edit-event/EditEventPage').then((mod) => ({ default: mod.EditEventPage })));
const EventOrdersPage = lazy(() => import('./features/event-admin/EventOrdersPage').then((mod) => ({ default: mod.EventOrdersPage })));
const EventOverviewPage = lazy(() => import('./features/event-admin/EventOverviewPage').then((mod) => ({ default: mod.EventOverviewPage })));
const EventStaffPage = lazy(() => import('./features/event-admin/EventStaffPage').then((mod) => ({ default: mod.EventStaffPage })));
const EventTimelinePage = lazy(() => import('./features/event-admin/EventTimelinePage').then((mod) => ({ default: mod.EventTimelinePage })));
const OrganizerProfilePage = lazy(() => import('./features/event-admin/OrganizerProfilePage').then((mod) => ({ default: mod.OrganizerProfilePage })));
const CampaignsPage = lazy(() => import('./features/campaigns/CampaignsPage').then((mod) => ({ default: mod.CampaignsPage })));
const CheckoutPage = lazy(() => import('./features/checkout/CheckoutPage').then((mod) => ({ default: mod.CheckoutPage })));
const CheckoutStartPage = lazy(() => import('./features/checkout/CheckoutStartPage').then((mod) => ({ default: mod.CheckoutStartPage })));
const NewEventPage = lazy(() => import('./features/event-setup/NewEventPage').then((mod) => ({ default: mod.NewEventPage })));
const SetupActivationPage = lazy(() => import('./features/event-setup/SetupActivationPage').then((mod) => ({ default: mod.SetupActivationPage })));
const SetupDetailsPage = lazy(() => import('./features/event-setup/SetupDetailsPage').then((mod) => ({ default: mod.SetupDetailsPage })));
const SetupReviewPage = lazy(() => import('./features/event-setup/SetupReviewPage').then((mod) => ({ default: mod.SetupReviewPage })));
const SetupTicketsPage = lazy(() => import('./features/event-setup/SetupTicketsPage').then((mod) => ({ default: mod.SetupTicketsPage })));
const EventListView = lazy(() => import('./features/my-events').then((mod) => ({ default: mod.EventListView })));
const MyOrdersPage = lazy(() => import('./features/orders/MyOrdersPage').then((mod) => ({ default: mod.MyOrdersPage })));
const MyTicketsPage = lazy(() => import('./features/orders/MyTicketsPage').then((mod) => ({ default: mod.MyTicketsPage })));
const OrderPage = lazy(() => import('./features/orders/OrderPage').then((mod) => ({ default: mod.OrderPage })));
const TicketPage = lazy(() => import('./features/orders/TicketPage').then((mod) => ({ default: mod.TicketPage })));
const NewCasePage = lazy(() => import('./features/support/NewCasePage').then((mod) => ({ default: mod.NewCasePage })));
const SupportCasePage = lazy(() => import('./features/support/SupportCasePage').then((mod) => ({ default: mod.SupportCasePage })));
const SupportListPage = lazy(() => import('./features/support/SupportListPage').then((mod) => ({ default: mod.SupportListPage })));
const PaidSalesPage = lazy(() => import('./features/paid-sales/PaidSalesPage').then((mod) => ({ default: mod.PaidSalesPage })));
const TicketTypesPage = lazy(() => import('./features/ticket-types/TicketTypesPage').then((mod) => ({ default: mod.TicketTypesPage })));


function SiteHeader() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate(paths.signIn);
  }

  return (
    <header className="site-header">
      <Link to={paths.home} className="brand">
        <img className="brand__mark" src="/brand/logo.png" alt="" width={44} height={44} />
        BiletFlow
      </Link>
      <div className="site-header__end">
        <nav className="site-nav" aria-label={t('nav.label')}>
          <NavLink to={paths.home} end>
            {t('nav.discover')}
          </NavLink>
          {hasRole(user, 'organizer') && (
            <>
              <NavLink to={paths.organizerEvents} end>
                {t('nav.myEvents')}
              </NavLink>
              <NavLink to={paths.organizerNewEvent}>{t('nav.createEvent')}</NavLink>
              <NavLink to={paths.organizerProfile}>{t('nav.profile')}</NavLink>
            </>
          )}
          {hasRole(user, 'platform_admin') && <NavLink to={paths.admin}>{t('nav.admin')}</NavLink>}
          {user ? (
            <>
              <NavLink to={paths.myTickets}>{t('nav.myTickets')}</NavLink>
              <NavLink to={paths.support}>{t('nav.support')}</NavLink>
              <NavLink to={paths.account} end>
                {t('nav.account')}
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to={paths.signIn}>{t('nav.signIn')}</NavLink>
              <NavLink to={paths.register}>{t('nav.register')}</NavLink>
            </>
          )}
        </nav>
        <LanguageSwitcher />
        {user && <NotificationsMenu />}
        {user && (
          <button type="button" className="btn btn--small" onClick={handleSignOut}>
            {t('nav.signOut')}
          </button>
        )}
      </div>
    </header>
  );
}

export function App() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <a href="#main" className="skip-link">
        {t('common.skipToContent')}
      </a>
      {USE_MOCKS && (
        <p className="mock-banner" role="note">
          {t('common.mockMode')}
        </p>
      )}
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <RouteFocus />
        <Suspense fallback={<LoadingState />}>
        <Routes>
          <Route path={paths.home} element={<DiscoverPage />} />
          <Route path="/events/:id" element={<PublicEventPage />} />

          <Route path={paths.signIn} element={<SignInPage />} />
          <Route path={paths.register} element={<RegisterPage />} />
          <Route path={paths.checkEmail} element={<CheckEmailPage />} />
          <Route path={paths.verifyEmail} element={<VerifyEmailPage />} />
          <Route path={paths.forgotPassword} element={<ForgotPasswordPage />} />
          <Route path={paths.resetPassword} element={<ResetPasswordPage />} />

          <Route element={<RequireAuth />}>
            <Route path={paths.account} element={<AccountPage />} />
            <Route path="/events/:id/checkout" element={<CheckoutStartPage />} />
            <Route path="/checkout/:reservationId" element={<CheckoutPage />} />
            <Route path={paths.myOrders} element={<MyOrdersPage />} />
            <Route path={paths.myTickets} element={<MyTicketsPage />} />
            <Route path="/orders/:id" element={<OrderPage />} />
            <Route path="/tickets/:id" element={<TicketPage />} />
            <Route path={paths.support} element={<SupportListPage />} />
            <Route path="/support/new" element={<NewCasePage />} />
            <Route path="/support/:id" element={<SupportCasePage />} />
          </Route>

          <Route element={<RequireAuth roles={['organizer']} />}>
            <Route path={paths.organizerEvents} element={<EventListView />} />
            <Route path={paths.organizerNewEvent} element={<NewEventPage />} />
            <Route path="/organizer/events/:id/setup/details" element={<SetupDetailsPage />} />
            <Route path="/organizer/events/:id/setup/tickets" element={<SetupTicketsPage />} />
            <Route path="/organizer/events/:id/setup/activation" element={<SetupActivationPage />} />
            <Route path="/organizer/events/:id/setup/review" element={<SetupReviewPage />} />
            <Route path="/organizer/events/:id/edit" element={<EditEventPage />} />
            <Route path="/organizer/events/:id" element={<EventOverviewPage />} />
            <Route path="/organizer/events/:id/orders" element={<EventOrdersPage />} />
            <Route path="/organizer/events/:id/staff" element={<EventStaffPage />} />
            <Route path="/organizer/events/:id/timeline" element={<EventTimelinePage />} />
            <Route path={paths.organizerProfile} element={<OrganizerProfilePage />} />
            <Route path="/organizer/events/:id/tickets" element={<TicketTypesPage />} />
            <Route path="/organizer/events/:id/paid-sales" element={<PaidSalesPage />} />
            <Route path="/organizer/events/:id/campaigns" element={<CampaignsPage />} />
          </Route>

          <Route element={<RequireAuth roles={['platform_admin']} />}>
            <Route path={paths.admin} element={<AdminSearchPage />} />
            <Route path="/admin/events" element={<AdminEventsPage />} />
            <Route path="/admin/reports" element={<AdminReportsPage />} />
            <Route path="/admin/payments" element={<AdminPaymentsPage />} />
            <Route path="/admin/activations" element={<AdminActivationsPage />} />
            <Route path="/admin/promos" element={<AdminPromosPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to={paths.home} replace />} />
        </Routes>
        </Suspense>
      </main>
    </div>
  );
}
