import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockEventsApi } from '../api/mocks/mockEvents';
import { renderApp } from '../test/renderApp';

describe('accessibility basics', () => {
  it('offers a skip link to the main content', async () => {
    sessionStorage.clear();
    renderApp('/');
    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skip).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('moves focus to the new page heading and updates the title after navigation', async () => {
    sessionStorage.clear();
    sessionStorage.setItem('biletflow.mockSession', 'usr-organizer');
    const user = userEvent.setup();
    renderApp('/organizer/events', { events: createMockEventsApi() });
    await screen.findByRole('heading', { name: 'My events', level: 1 });
    await waitFor(() => expect(document.title).toBe('My events · BiletFlow'));

    await user.click(await screen.findByRole('link', { name: 'Almaty Nights — Vol. 4' }));
    const heading = await screen.findByRole('heading', { name: 'Almaty Nights — Vol. 4', level: 1 });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(document.title).toBe('Almaty Nights — Vol. 4 · BiletFlow');
  });
});
