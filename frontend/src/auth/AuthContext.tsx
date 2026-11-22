import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, tokens } from "../api/client";
import type { Me, Role } from "../api/types";

interface AuthState {
  user: Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

const IDLE_LOGOUT_MS = 15 * 60 * 1000; // shared counter PCs: sign out after 15 idle minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    if (!tokens.access) {
      setLoading(false);
      return;
    }
    api
      .get<Me>("/auth/me/")
      .then((res) => setUser(res.data))
      .catch(logout)
      .finally(() => setLoading(false));
  }, [logout]);

  useEffect(() => {
    window.addEventListener("orbiterp:logout", logout);
    return () => window.removeEventListener("orbiterp:logout", logout);
  }, [logout]);

  useEffect(() => {
    if (!user) return;
    let timer = window.setTimeout(logout, IDLE_LOGOUT_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(logout, IDLE_LOGOUT_MS);
    };
    const events = ["mousemove", "keydown", "click", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [user, logout]);

  const login = async (username: string, password: string) => {
    const { data } = await api.post("/auth/token/", { username, password });
    tokens.set(data.access, data.refresh);
    const me = await api.get<Me>("/auth/me/");
    setUser(me.data);
  };

  const hasRole = (...roles: Role[]) =>
    !!user && (user.is_superuser || user.roles.includes("admin") || roles.some((r) => user.roles.includes(r)));

  return <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
