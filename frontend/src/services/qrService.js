const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

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
    const res = await fetch(`${API_BASE_URL}/qr/stats`);
    return handleResponse(res);
  },

  // ── List with filters & pagination ───────────────────────────
  async getList({ page = 1, limit = 25, search = "", course = "", year = "", section = "", qrStatus = "" } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search.trim()) params.set("search", search.trim());
    if (course.trim()) params.set("course", course.trim());
    if (year.trim()) params.set("year", year.trim());
    if (section.trim()) params.set("section", section.trim());
    if (qrStatus.trim()) params.set("qrStatus", qrStatus.trim());

    const res = await fetch(`${API_BASE_URL}/qr?${params.toString()}`);
    return handleResponse(res);
  },

  // ── Get single student QR data ───────────────────────────────
  async getById(id) {
    const res = await fetch(`${API_BASE_URL}/qr/${id}`);
    return handleResponse(res);
  },

  // ── Generate QR for a student ────────────────────────────────
  async generate(id) {
    const res = await fetch(`${API_BASE_URL}/qr/generate/${id}`, {
      method: "POST",
    });
    return handleResponse(res);
  },

  // ── Generate QR for multiple students ────────────────────────
  async generateBulk(ids) {
    const res = await fetch(`${API_BASE_URL}/qr/generate-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    return handleResponse(res);
  },

  // ── Regenerate QR ────────────────────────────────────────────
  async regenerate(id) {
    const res = await fetch(`${API_BASE_URL}/qr/regenerate/${id}`, {
      method: "POST",
    });
    return handleResponse(res);
  },

  // ── Mark as printed ──────────────────────────────────────────
  async markPrinted(id) {
    const res = await fetch(`${API_BASE_URL}/qr/${id}/print`, {
      method: "PUT",
    });
    return handleResponse(res);
  },

  // ── Bulk mark as printed ─────────────────────────────────────
  async markPrintedBulk(ids) {
    const res = await fetch(`${API_BASE_URL}/qr/print-bulk`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    return handleResponse(res);
  },

  // ── Delete QR ────────────────────────────────────────────────
  async delete(id) {
    const res = await fetch(`${API_BASE_URL}/qr/${id}`, {
      method: "DELETE",
    });
    return handleResponse(res);
  },

  // ── Bulk delete QR ───────────────────────────────────────────
  async deleteBulk(ids) {
    const res = await fetch(`${API_BASE_URL}/qr/bulk/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    return handleResponse(res);
  },

  // ── Get filter options ───────────────────────────────────────
  async getFilterOptions() {
    const res = await fetch(`${API_BASE_URL}/qr/filters/options`);
    return handleResponse(res);
  },
};

export default qrService;

