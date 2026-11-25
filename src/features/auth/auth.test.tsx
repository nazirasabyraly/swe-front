import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { createMockAuthApi } from '../../api/mocks/mockAuth';
import { latestMockEmail } from '../../api/mocks/outbox';
import { safeNextPath } from '../../routes';
import { renderApp } from '../../test/renderApp';

beforeEach(() => sessionStorage.clear());

const location = () => screen.getByTestId('location').textContent;

async function signIn(user: UserEvent, email: string, password = 'demo1234') {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('route guards', () => {
  it('sends anonymous visitors to sign in and back to the page they wanted', async () => {
    const user = userEvent.setup();
    renderApp('/organizer/events/new');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(location()).toBe('/sign-in?next=%2Forganizer%2Fevents%2Fnew');

    await signIn(user, 'organizer@demo.kz');

    expect(await screen.findByRole('heading', { name: 'Create event' })).toBeInTheDocument();
    expect(location()).toBe('/organizer/events/new');
  });

  it('shows "no access" to signed-in users without the role', async () => {
    const user = userEvent.setup();
    renderApp('/sign-in');
    await signIn(user, 'attendee@demo.kz');
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My events' })).not.toBeInTheDocument();

    renderApp('/organizer/events');

    expect(
      await screen.findByRole('heading', { name: 'You don’t have access to this page' }),
    ).toBeInTheDocument();
  });

  it('ignores off-site "next" targets', async () => {
    const user = userEvent.setup();
    renderApp('/sign-in?next=%2F%2Fevil.example');
    await signIn(user, 'organizer@demo.kz');
    await waitFor(() => expect(location()).toBe('/organizer/events'));
  });

  it.each([
    ['/organizer/events', '/organizer/events'],
    ['//evil.example', null],
    ['https://evil.example', null],
    ['/\\evil.example', null],
    [null, null],
  ])('safeNextPath(%s) → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe('sign in / sign out', () => {
  it('validates before calling the server', async () => {
    const user = userEvent.setup();
    const { auth } = renderApp('/sign-in');
    const spy = vi.spyOn(auth, 'signIn');

    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter your email.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows a clear message for wrong credentials', async () => {
    const user = userEvent.setup();
    renderApp('/sign-in');
    await signIn(user, 'organizer@demo.kz', 'wrong-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
  });

  it('signs out and returns to sign in', async () => {
    const user = userEvent.setup();
    renderApp('/sign-in');
    await signIn(user, 'organizer@demo.kz');
    await screen.findByRole('heading', { name: 'My events' });

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation')).getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('registration and email verification', () => {
  it('registers, verifies the email from the link, then signs in', async () => {
    const user = userEvent.setup();
    const auth = createMockAuthApi();
    renderApp('/register', { auth });

    await user.click(await screen.findByRole('radio', { name: /Organise events/ }));
    await user.type(screen.getByLabelText('Full name'), 'Aigerim Sadykova');
    await user.type(screen.getByLabelText('Email'), 'aigerim@example.kz');
    await user.type(screen.getByLabelText('Password'), 'steppe-2026');
    await user.type(screen.getByLabelText('Repeat password'), 'steppe-2026');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/We sent a verification link to aigerim@example.kz/)).toBeInTheDocument();
    const link = latestMockEmail('aigerim@example.kz', 'verify-email')!.link;

    renderApp(link, { auth });
    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();

    renderApp('/sign-in', { auth });
    await signIn(user, 'aigerim@example.kz', 'steppe-2026');
    expect(await screen.findByRole('heading', { name: 'My events' })).toBeInTheDocument();
  });

  it('checks fields and reports an email that is already registered', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(await screen.findByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.type(screen.getByLabelText('Repeat password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText('Passwords don’t match.')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveFocus();

    await user.type(screen.getByLabelText('Full name'), 'Someone');
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'organizer@demo.kz');
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'long-enough');
    await user.clear(screen.getByLabelText('Repeat password'));
    await user.type(screen.getByLabelText('Repeat password'), 'long-enough');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/An account with this email already exists/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('blocks sign-in until the email is verified and offers to resend the link', async () => {
    const user = userEvent.setup();
    const auth = createMockAuthApi();
    await auth.register({ name: 'New', email: 'new@example.kz', password: 'password-1', accountType: 'attendee' });
    renderApp('/sign-in', { auth });

    await signIn(user, 'new@example.kz', 'password-1');

    expect(await screen.findByText('Verify your email first')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resend verification email' }));
    expect(await screen.findByText('A new verification link is on its way.')).toBeInTheDocument();
  });

  it('rejects an invalid verification link', async () => {
    renderApp('/verify-email?token=bogus');
    expect(await screen.findByRole('heading', { name: 'This link doesn’t work' })).toBeInTheDocument();
  });
});

describe('password reset', () => {
  it('always confirms the request, and the emailed link sets a new password', async () => {
    const user = userEvent.setup();
    const auth = createMockAuthApi();
    renderApp('/forgot-password', { auth });

    await user.type(await screen.findByLabelText('Email'), 'attendee@demo.kz');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/If an account exists for attendee@demo.kz/)).toBeInTheDocument();

    renderApp(latestMockEmail('attendee@demo.kz', 'reset-password')!.link, { auth });
    await user.type(await screen.findByLabelText('New password'), 'brand-new-pass');
    await user.type(screen.getByLabelText('Repeat new password'), 'brand-new-pass');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument();

    renderApp('/sign-in', { auth });
    await signIn(user, 'attendee@demo.kz', 'brand-new-pass');
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument();
  });

  it('does not reveal whether an email has an account', async () => {
    const user = userEvent.setup();
    renderApp('/forgot-password');
    await user.type(await screen.findByLabelText('Email'), 'nobody@example.kz');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/If an account exists for nobody@example.kz/)).toBeInTheDocument();
  });

  it('explains an expired reset link', async () => {
    const user = userEvent.setup();
    renderApp('/reset-password?token=expired');
    await user.type(await screen.findByLabelText('New password'), 'brand-new-pass');
    await user.type(screen.getByLabelText('Repeat new password'), 'brand-new-pass');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('heading', { name: 'This link doesn’t work' })).toBeInTheDocument();
  });
});
