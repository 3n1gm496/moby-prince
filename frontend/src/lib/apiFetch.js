/**
 * Thin fetch wrapper that injects the X-API-Key header on every request
 * when VITE_API_KEY is set at build time.  Drop-in replacement for fetch.
 *
 * Usage:
 *   import { apiFetch } from "../lib/apiFetch";
 *   const res = await apiFetch("/api/answer", { method: "POST", body: … });
 */

const API_KEY = import.meta.env.VITE_API_KEY;

export function apiFetch(url, options = {}) {
  if (!API_KEY) return fetch(url, options);

  const headers = new Headers(options.headers || {});
  headers.set("X-API-Key", API_KEY);

  return fetch(url, { ...options, headers });
}
