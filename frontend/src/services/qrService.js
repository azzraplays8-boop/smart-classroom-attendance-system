import { API_BASE_URL } from "../config/api";

function getAuthHeaders() {
  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse(res) {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data;
}

export const qrService = {
  // ── Stats ────────────────────────────────────────────────────
  async getStats() {
    const res = await fetch(`${API_BASE_URL}/qr/stats`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // ── List with filters & pagination ───────────────────────────
  async getList({ page = 1, limit = 25, search = "", department = "", level = "", group = "", qrStatus = "" } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search.trim()) params.set("search", search.trim());
    if (department.trim()) params.set("department", department.trim());
    if (level.trim()) params.set("level", level.trim());
    if (group.trim()) params.set("group", group.trim());
    if (qrStatus.trim()) params.set("qrStatus", qrStatus.trim());

    const res = await fetch(`${API_BASE_URL}/qr?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // ── Get single participant QR data ───────────────────────────
  async getById(id) {
    const res = await fetch(`${API_BASE_URL}/qr/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // ── Generate QR for a participant ────────────────────────────
  async generate(id) {
    const res = await fetch(`${API_BASE_URL}/qr/generate/${id}`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // ── Generate QR for multiple participants ────────────────────
  async generateBulk(ids) {
    const res = await fetch(`${API_BASE_URL}/qr/generate-bulk`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids }),
    });
    return handleResponse(res);
  },

  // ── Regenerate QR ────────────────────────────────────────────
  async regenerate(id) {
    const res = await fetch(`${API_BASE_URL}/qr/regenerate/${id}`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // ── Mark as printed ──────────────────────────────────────────
  async markPrinted(id) {
    const res = await fetch(`${API_BASE_URL}/qr/${id}/print`, {
      method: "PUT",
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // ── Bulk mark as printed ─────────────────────────────────────
  async markPrintedBulk(ids) {
    const res = await fetch(`${API_BASE_URL}/qr/print-bulk`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids }),
    });
    return handleResponse(res);
  },

  // ── Delete QR ────────────────────────────────────────────────
  async delete(id) {
    const res = await fetch(`${API_BASE_URL}/qr/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // ── Bulk delete QR ───────────────────────────────────────────
  async deleteBulk(ids) {
    const res = await fetch(`${API_BASE_URL}/qr/bulk/delete`, {
      method: "DELETE",
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids }),
    });
    return handleResponse(res);
  },

  // ── Get filter options ───────────────────────────────────────
  async getFilterOptions() {
    const res = await fetch(`${API_BASE_URL}/qr/filters/options`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
};

export default qrService;

