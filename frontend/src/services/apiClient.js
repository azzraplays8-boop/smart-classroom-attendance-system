import { API_BASE_URL } from "../config/api";

export function getStoredAuthToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
}

export function applyAuthHeaders(existingHeaders = {}) {
  const headers = new Headers(existingHeaders);
  const token = getStoredAuthToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

export function authFetch(input, init = {}) {
  const inputValue = typeof input === "string" ? input : String(input);
  const isAbsoluteUrl = /^https?:\/\//i.test(inputValue);
  const targetUrl = isAbsoluteUrl
    ? inputValue
    : `${API_BASE_URL}${inputValue.startsWith("/") ? inputValue : `/${inputValue}`}`;

  const nextInit = { ...init };
  const originalHeaders = nextInit.headers || {};

  if (originalHeaders instanceof Headers) {
    nextInit.headers = applyAuthHeaders(originalHeaders);
  } else if (typeof originalHeaders === "object") {
    nextInit.headers = applyAuthHeaders(originalHeaders);
  } else {
    nextInit.headers = applyAuthHeaders();
  }

  if (
    nextInit.body &&
    !(nextInit.body instanceof FormData) &&
    typeof nextInit.body === "string" &&
    !nextInit.headers.has?.("Content-Type")
  ) {
    nextInit.headers.set("Content-Type", "application/json");
  }

  return fetch(targetUrl, nextInit);
}

export async function authJsonFetch(input, init = {}) {
  const response = await authFetch(input, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    data,
    response,
  };
}
