import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearToken,
  fetchMe,
  getToken,
  login as apiLogin,
  setToken,
} from "../lib/api";
import type { Store, User } from "../lib/types";

type AuthContextValue = {
  user: User | null;
  store: Store | null;
  loading: boolean;
  signIn: (phone: string, pin: string) => Promise<void>;
  signOut: () => void;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setStore(null);
      return;
    }

    try {
      const data = await fetchMe();
      setUser(data.user);
      setStore(data.store);
    } catch {
      clearToken();
      setUser(null);
      setStore(null);
    }
  }, []);

  useEffect(() => {
    refreshSession().finally(() => setLoading(false));
  }, [refreshSession]);

  const signIn = useCallback(async (phone: string, pin: string) => {
    const data = await apiLogin(phone, pin);
    setToken(data.token);
    setUser(data.user);
    setStore(data.store);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
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
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
