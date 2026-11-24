import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router';
import { useEventsApi } from './api/EventsApiContext';
import { CreateEventWizard } from './features/create-event';
import { EditEventPage } from './features/edit-event/EditEventPage';
import { EventListView, type EventListLocationState } from './features/my-events';

function CreateEventPage() {
  const api = useEventsApi();
  const navigate = useNavigate();
  return (
    <CreateEventWizard
      onSubmit={async (input) => {
        await api.createEvent(input);
      }}
      onDone={(input) => {
        const state: EventListLocationState = { flash: `“${input.title}” created as a draft` };
        navigate('/events', { state });
      }}
    />
  );
}

export function App() {
  return (
    <div className="page">
      <header className="site-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          BiletFlow
        </div>
        <nav className="site-nav" aria-label="Organizer">
          <NavLink to="/events" end>
            My events
          </NavLink>
          <NavLink to="/events/new">Create event</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/events" replace />} />
          <Route path="/events" element={<EventListView />} />
          <Route path="/events/new" element={<CreateEventPage />} />
          <Route path="/events/:id/edit" element={<EditEventPage />} />
          <Route path="*" element={<Navigate to="/events" replace />} />
        </Routes>
      </main>
    </div>
  );
}
