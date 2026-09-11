import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthUser, LoginRequest, LoginResponse, UserRole } from '@asset/shared';
import { roleAtLeast } from '@asset/shared';
import { api } from '@/lib/api-client';
import { setSessionExpiredHandler } from '@/lib/api-client';
import { tokenStorage } from '@/lib/token-storage';

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the stored token has been checked against the API. */
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (credentials: LoginRequest) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  /** Role check used to hide actions a VIEWER cannot take (CLAUDE.md §7.10). */
  can: (role: UserRole) => boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const queryClient = useQueryClient();

  // Restore the session on load: a stored access token is only trustworthy if
  // the API still accepts it.
  React.useEffect(() => {
    let cancelled = false;

    async function restore(): Promise<void> {
      const { accessToken, refreshToken } = tokenStorage.read();
      if (!accessToken && !refreshToken) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const me = await api.get<AuthUser>('/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        tokenStorage.clear();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // When a refresh fails for good, drop the user so the router shows login.
  React.useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      queryClient.clear();
    });
  }, [queryClient]);

  const signIn = React.useCallback(async (credentials: LoginRequest): Promise<AuthUser> => {
    const response = await api.post<LoginResponse>('/auth/login', credentials, {
      anonymous: true,
    });
    tokenStorage.write(response);
    setUser(response.user);
    return response.user;
  }, []);

  const signOut = React.useCallback(async (): Promise<void> => {
    const { refreshToken } = tokenStorage.read();
    if (refreshToken) {
      // A failed revoke must not trap the user in a signed-in shell.
      await api.post('/auth/logout', { refreshToken }, { anonymous: true }).catch(() => undefined);
    }
    tokenStorage.clear();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      signIn,
      signOut,
      can: (role) => (user ? roleAtLeast(user.role, role) : false),
    }),
    [user, isLoading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
