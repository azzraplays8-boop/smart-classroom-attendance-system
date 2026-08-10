/**
 * Centralized API configuration.
 *
 * All frontend API calls read the backend base URL from the environment
 * variable VITE_API_BASE_URL (set at build time on Vercel / in .env).
 *
 * There is intentionally NO localhost fallback: in production the backend
 * is a separate service (e.g. Render) and must be provided explicitly.
 */
const raw = import.meta.env.VITE_API_BASE_URL || "";

if (!raw) {
  throw new Error(
    "VITE_API_BASE_URL environment variable is required. Set it in your frontend .env file or in the Vercel dashboard."
  );
}

// Normalize: strip any trailing slashes so callers can safely append paths.
export const API_BASE_URL = raw.replace(/\/+$/, "");

export function buildApiUrl(path) {
  if (typeof path !== "string") {
    throw new Error("API path must be a string.");
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
