import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuthApi } from '../api/ApiContext';
import type { Role, User } from '../api/auth';
import { paths } from '../routes';

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User };

interface AuthContextValue {
  state: AuthState;
  user: User | null;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Loads the current session once, and exposes sign-in/out to the app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useAuthApi();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api.me().then(
      (user) => !cancelled && setState(user ? { status: 'authenticated', user } : { status: 'anonymous' }),
      // If the session can't be checked, behave as signed out; protected pages send people to sign in.
      () => !cancelled && setState({ status: 'anonymous' }),
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const user = await api.signIn(email, password);
      setState({ status: 'authenticated', user });
      return user;
    },
    [api],
  );

  const signOut = useCallback(async () => {
    try {
      await api.signOut();
    } finally {
      setState({ status: 'anonymous' });
    }
  }, [api]);

  const value = useMemo(
    () => ({ state, user: state.status === 'authenticated' ? state.user : null, signIn, signOut }),
    [state, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

export const hasRole = (user: User | null, role: Role) => Boolean(user?.roles.includes(role));

/** Where to send a user after sign-in when no `next` path was requested. */
export function homePathFor(user: User): string {
  if (user.roles.includes('platform_admin')) return paths.admin;
  if (user.roles.includes('organizer')) return paths.organizerEvents;
  return paths.account;
}
