/*
 * Auth API client. Contract: docs/backend-contract.md, "Accounts".
 * Session is a cookie set by sign-in; the client never sees a token.
 */
import { ApiError, json, request } from './http';

export const ROLES = ['attendee', 'organizer', 'platform_admin'] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  emailVerified: boolean;
}

export type AccountType = 'attendee' | 'organizer';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  accountType: AccountType;
}

/** Error codes the auth screens react to. */
export const AUTH_ERRORS = {
  invalidCredentials: 'invalid_credentials',
  emailNotVerified: 'email_not_verified',
  emailTaken: 'email_taken',
  weakPassword: 'weak_password',
  invalidToken: 'invalid_token',
} as const;

export interface AuthApi {
  /** The signed-in user, or null when there is no session. */
  me(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  /** Creates an unverified account and emails a verification link. */
  register(input: RegisterInput): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
  /** Always succeeds, whether or not the email exists (no account enumeration). */
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
}

export const httpAuthApi: AuthApi = {
  async me() {
    try {
      return (await request<{ user: User }>('/api/auth/me')).user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
  async signIn(email, password) {
    return (await request<{ user: User }>('/api/auth/sign-in', json('POST', { email, password }))).user;
  },
  async signOut() {
    await request('/api/auth/sign-out', { method: 'POST' });
  },
  async register(input) {
    await request('/api/auth/register', json('POST', input));
  },
  async verifyEmail(token) {
    await request('/api/auth/verify-email', json('POST', { token }));
  },
  async resendVerification(email) {
    await request('/api/auth/resend-verification', json('POST', { email }));
  },
  async requestPasswordReset(email) {
    await request('/api/auth/forgot-password', json('POST', { email }));
  },
  async resetPassword(token, password) {
    await request('/api/auth/reset-password', json('POST', { token, password }));
  },
};
