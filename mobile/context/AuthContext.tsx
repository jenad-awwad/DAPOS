import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { clearToken, getToken, login as apiLogin, setToken } from "../lib/api";
import type { Store, User } from "../lib/types";

type AuthContextValue = {
  user: User | null;
  store: Store | null;
  loading: boolean;
  signIn: (phone: string, pin: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setStore(null);
      return;
    }

    try {
      const { request } = await import("../lib/api-session");
      const data = await request<{ user: User; store: Store }>("/auth/me");
      setUser(data.user);
      setStore(data.store);
    } catch {
      await clearToken();
      setUser(null);
      setStore(null);
    }
  }, []);

  useEffect(() => {
    refreshSession().finally(() => setLoading(false));
  }, [refreshSession]);

  const signIn = useCallback(async (phone: string, pin: string) => {
    const data = await apiLogin(phone, pin);
    await setToken(data.token);
    setUser(data.user);
    setStore(data.store);
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
    setStore(null);
  }, []);

  const value = useMemo(
    () => ({ user, store, loading, signIn, signOut, refreshSession }),
    [user, store, loading, signIn, signOut, refreshSession],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
