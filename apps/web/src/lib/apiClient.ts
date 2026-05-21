/**
 * Axios API client with automatic Supabase JWT injection.
 * All API requests go through here — never raw fetch calls.
 */
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { supabase } from './supabase';

const BASE_URL = (import.meta.env['VITE_API_URL'] as string) ?? 'http://localhost:4000';

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach Bearer token ──────────────────────────────────
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      config.headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

// ── Response interceptor: handle 401 (token expired) ─────────────────────────
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Try to refresh the session once
      const { data } = await supabase.auth.refreshSession();
      if (data.session) {
        // Retry original request with new token
        const originalRequest = error.config as InternalAxiosRequestConfig;
        originalRequest.headers.Authorization = `Bearer ${data.session.access_token}`;
        return apiClient(originalRequest);
      }
      // Session dead — sign out
      await supabase.auth.signOut();
    }
    return Promise.reject(error);
  }
);

/** Typed helper to extract data from API responses */
export function extractData<T>(response: { data: { data: T } }): T {
  return response.data.data;
}
