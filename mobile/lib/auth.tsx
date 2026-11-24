import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, markAuthReady, setToken, setUnauthorizedHandler, type User } from "./api";
import { cacheClear, secureDelete, secureGet, secureSet } from "./storage";
import { registerForPush, unregisterPush } from "./push";

const TOKEN_KEY = "lp_token";
const USER_KEY = "lp_user";

type AuthState = {
  ready: boolean;
  user: User | null;
  signIn: (schoolCode: string, username: string, password: string) => Promise<void>;
  /** Finish a single sign-on: the server handed the app a session token and the user. */
  signInWithToken: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const pushToken = useRef<string | null>(null);

  const signOut = useCallback(async () => {
    unregisterPush(pushToken.current);
    pushToken.current = null;
    api.logout().catch(() => {}); // best effort; token is dropped regardless
    setToken(null);
    setUser(null);
    await Promise.all([secureDelete(TOKEN_KEY), secureDelete(USER_KEY), cacheClear()]);
  }, []);

  // Restore the saved session on launch.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    (async () => {
      try {
        const [token, savedUser] = await Promise.all([secureGet(TOKEN_KEY), secureGet(USER_KEY)]);
        if (token) {
          setToken(token);
          if (savedUser) setUser(JSON.parse(savedUser) as User);
        }
        markAuthReady(); // from here on, requests go out with the restored token
        if (token) {
          // Validate in the background; an expired token signs the user out via the 401 handler.
          api
            .me()
            .then((u) => {
              setUser(u);
              registerForPush().then((t) => (pushToken.current = t));
            })
            .catch(() => {});
        }
      } finally {
        markAuthReady();
        setReady(true);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const signIn = useCallback(async (schoolCode: string, username: string, password: string) => {
    const { token, user: u } = await api.login({ schoolCode, username, password });
    setToken(token);
    setUser(u);
    await Promise.all([secureSet(TOKEN_KEY, token), secureSet(USER_KEY, JSON.stringify(u))]);
    registerForPush().then((t) => (pushToken.current = t));
  }, []);

  const signInWithToken = useCallback(async (token: string, u: User) => {
    setToken(token);
    setUser(u);
    await Promise.all([secureSet(TOKEN_KEY, token), secureSet(USER_KEY, JSON.stringify(u))]);
    // The SSO redirect carries a minimal profile; fetch the full one (class, school) now.
    api.me().then((full) => { setUser(full); void secureSet(USER_KEY, JSON.stringify(full)); }).catch(() => {});
    registerForPush().then((t) => (pushToken.current = t));
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await api.me();
    setUser(u);
    await secureSet(USER_KEY, JSON.stringify(u));
  }, []);

  const value = useMemo(() => ({ ready, user, signIn, signInWithToken, signOut, refreshUser }), [ready, user, signIn, signInWithToken, signOut, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
