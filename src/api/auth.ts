/*
 * Auth API client. Backend: app/api/v1/auth.py.
 * Sign-in returns a JWT pair, kept by `tokenStore`; `request()` sends it as a bearer token.
 */
import i18n from '../i18n';
import { ApiError, json, request, tokenStore, type TokenPair } from './http';

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
  /** The backend reports a too-short password as a generic 422 `validation_error`. */
  weakPassword: 'validation_error',
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

/** `UserRead` from the backend, after camelCasing. */
export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  locale: 'kk' | 'ru' | 'en';
  status: 'active' | 'suspended';
  emailVerified: boolean;
  roles: Role[];
  createdAt: string;
}

export const userFromDto = (dto: UserDto): User => ({
  id: dto.id,
  name: dto.fullName,
  email: dto.email,
  roles: dto.roles,
  emailVerified: dto.emailVerified,
});

const LOCALES = ['kk', 'ru', 'en'] as const;
const currentLocale = () => LOCALES.find((l) => i18n.language?.startsWith(l)) ?? 'ru';

export const httpAuthApi: AuthApi = {
  async me() {
    if (!tokenStore.access && !tokenStore.refresh) return null;
    try {
      return userFromDto(await request<UserDto>('/me'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        tokenStore.clear();
        return null;
      }
      throw err;
    }
  },
  async signIn(email, password) {
    tokenStore.set(await request<TokenPair>('/auth/login', json('POST', { email, password })));
    return userFromDto(await request<UserDto>('/me'));
  },
  async signOut() {
    const refreshToken = tokenStore.refresh;
    try {
      if (refreshToken) await request('/auth/logout', json('POST', { refreshToken }));
    } finally {
      tokenStore.clear();
    }
  },
  async register({ name, email, password, accountType }) {
    await request(
      '/auth/register',
      json('POST', { email, password, fullName: name, role: accountType, locale: currentLocale() }),
    );
  },
  async verifyEmail(token) {
    await request('/auth/verify-email', json('POST', { token }));
  },
  async resendVerification(email) {
    await request('/auth/verify-email/resend', json('POST', { email }));
  },
  async requestPasswordReset(email) {
    await request('/auth/password-reset/request', json('POST', { email }));
  },
  async resetPassword(token, password) {
    await request('/auth/password-reset/confirm', json('POST', { token, newPassword: password }));
  },
};
