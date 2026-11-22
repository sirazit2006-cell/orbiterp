import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const ACCESS = "orbiterp.access";
const REFRESH = "orbiterp.refresh";

export const tokens = {
  get access() {
    return sessionStorage.getItem(ACCESS);
  },
  get refresh() {
    return sessionStorage.getItem(REFRESH);
  },
  set(access: string, refresh?: string) {
    sessionStorage.setItem(ACCESS, access);
    if (refresh) sessionStorage.setItem(REFRESH, refresh);
  },
  clear() {
    sessionStorage.removeItem(ACCESS);
    sessionStorage.removeItem(REFRESH);
  },
};

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? "/api" });

api.interceptors.request.use((config) => {
  if (tokens.access) config.headers.Authorization = `Bearer ${tokens.access}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccess(): Promise<string | null> {
  if (!tokens.refresh) return null;
  try {
    const { data } = await axios.post(`${api.defaults.baseURL}/auth/token/refresh/`, { refresh: tokens.refresh });
    tokens.set(data.access, data.refresh);
    return data.access;
  } catch {
    tokens.clear();
    return null;
  }
}

// On a 401, refresh the access token once and replay the request.
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status !== 401 || !original || original._retried) throw error;
    original._retried = true;
    refreshing ??= refreshAccess().finally(() => (refreshing = null));
    const access = await refreshing;
    if (!access) {
      window.dispatchEvent(new Event("orbiterp:logout"));
      throw error;
    }
    original.headers.Authorization = `Bearer ${access}`;
    return api(original);
  },
);

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Turn a DRF validation error into { field: "message" } for form display. */
export function fieldErrors(error: unknown): Record<string, string> {
  const data = (error as AxiosError)?.response?.data;
  if (!data || typeof data !== "object") return {};
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]),
  );
}
