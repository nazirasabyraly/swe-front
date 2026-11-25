import { AUTH_ERRORS, type AuthApi, type Role, type User } from '../auth';
import { sendMockEmail } from './outbox';
import { mockDelay, mockError, mockId } from './util';

/** In-browser stand-in for the auth endpoints. Accounts reset on reload; the session survives it. */

export const MOCK_PASSWORD = 'demo1234';
export const MOCK_EMAILS = ['organizer@demo.kz', 'attendee@demo.kz', 'admin@demo.kz'];

interface MockAccount extends User {
  password: string;
}

const seedAccounts = (): MockAccount[] => [
  account('usr-organizer', 'Demo Organizer', 'organizer@demo.kz', ['attendee', 'organizer']),
  account('usr-attendee', 'Demo Attendee', 'attendee@demo.kz', ['attendee']),
  account('usr-admin', 'Demo Admin', 'admin@demo.kz', ['platform_admin']),
];

function account(id: string, name: string, email: string, roles: Role[]): MockAccount {
  return { id, name, email, roles, emailVerified: true, password: MOCK_PASSWORD };
}

const SESSION_KEY = 'biletflow.mockSession';

const session = {
  get(): string | null {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set(id: string | null) {
    try {
      if (id) sessionStorage.setItem(SESSION_KEY, id);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Session just won't survive a reload.
    }
  },
};

/** Mock-only: display names and roles of the seeded demo accounts, for other mocks. */
export function mockAccountInfo(id: string): { id: string; name: string; email: string; roles: Role[] } | null {
  const found = seedAccounts().find((a) => a.id === id);
  return found ? { id: found.id, name: found.name, email: found.email, roles: found.roles } : null;
}

export const mockAllAccounts = () => seedAccounts().map((a) => mockAccountInfo(a.id)!);

export function mockAccountByEmail(email: string) {
  const found = seedAccounts().find((a) => a.email === email.trim().toLowerCase());
  return found ? mockAccountInfo(found.id) : null;
}

/** Mock-only: the signed-in demo user's id, for mocks that keep per-user data. */
export const mockSessionUserId = (): string | null => session.get();

const toUser = ({ password: _password, ...user }: MockAccount): User => structuredClone(user);
const normalise = (email: string) => email.trim().toLowerCase();

export function createMockAuthApi(accounts: MockAccount[] = seedAccounts()): AuthApi {
  const byEmail = new Map(accounts.map((a) => [a.email, a]));
  const verifyTokens = new Map<string, string>(); // token → email
  const resetTokens = new Map<string, string>();

  function issue(tokens: Map<string, string>, email: string, kind: 'verify-email' | 'reset-password') {
    const token = mockId('tok');
    tokens.set(token, email);
    sendMockEmail({ to: email, kind, link: `/${kind}?token=${encodeURIComponent(token)}` });
  }

  function consume(tokens: Map<string, string>, token: string): MockAccount {
    const email = tokens.get(token);
    const found = email ? byEmail.get(email) : undefined;
    if (!found) throw mockError(400, AUTH_ERRORS.invalidToken, 'This link is invalid or has expired.');
    tokens.delete(token);
    return found;
  }

  function checkPassword(password: string) {
    if (password.length < 8) {
      throw mockError(422, AUTH_ERRORS.weakPassword, 'Use at least 8 characters.');
    }
  }

  return {
    async me() {
      await mockDelay(150);
      const id = session.get();
      const found = accounts.find((a) => a.id === id);
      return found ? toUser(found) : null;
    },
    async signIn(email, password) {
      await mockDelay();
      const found = byEmail.get(normalise(email));
      if (!found || found.password !== password) {
        throw mockError(401, AUTH_ERRORS.invalidCredentials, 'Wrong email or password.');
      }
      if (!found.emailVerified) {
        throw mockError(403, AUTH_ERRORS.emailNotVerified, 'Verify your email address first.');
      }
      session.set(found.id);
      return toUser(found);
    },
    async signOut() {
      await mockDelay(100);
      session.set(null);
    },
    async register({ name, email, password, accountType }) {
      await mockDelay();
      const address = normalise(email);
      if (byEmail.has(address)) {
        throw mockError(409, AUTH_ERRORS.emailTaken, 'An account with this email already exists.');
      }
      checkPassword(password);
      const roles: Role[] = accountType === 'organizer' ? ['attendee', 'organizer'] : ['attendee'];
      const created: MockAccount = {
        id: mockId('usr'),
        name: name.trim(),
        email: address,
        roles,
        emailVerified: false,
        password,
      };
      accounts.push(created);
      byEmail.set(address, created);
      issue(verifyTokens, address, 'verify-email');
    },
    async verifyEmail(token) {
      await mockDelay();
      consume(verifyTokens, token).emailVerified = true;
    },
    async resendVerification(email) {
      await mockDelay();
      const found = byEmail.get(normalise(email));
      if (found && !found.emailVerified) issue(verifyTokens, found.email, 'verify-email');
    },
    async requestPasswordReset(email) {
      await mockDelay();
      const found = byEmail.get(normalise(email));
      if (found) issue(resetTokens, found.email, 'reset-password');
    },
    async resetPassword(token, password) {
      await mockDelay();
      checkPassword(password);
      consume(resetTokens, token).password = password;
    },
  };
}
