import { CreateEventWizard, type CreateEventInput } from './features/create-event';

// Placeholder until the event-creation API is wired up.
async function createEvent(event: CreateEventInput) {
  console.info('createEvent (not yet connected to the API)', event);
}

export function App() {
  return (
    <div className="page">
      <header className="site-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          BiletFlow
        </div>
        <span className="site-header__meta">Organizer</span>
      </header>
      <main>
        <CreateEventWizard onSubmit={createEvent} />
      </main>
    </div>
  );
}
