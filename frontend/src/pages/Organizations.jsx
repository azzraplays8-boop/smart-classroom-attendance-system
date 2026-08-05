/**
 * Organizations — Super Admin organization & invitation code management.
 */
import { useCallback, useEffect, useState } from "react";
import {
  FaBuilding,
  FaPlus,
  FaEdit,
  FaTrash,
  FaCopy,
  FaUsers,
  FaKey,
  FaCheck,
  FaTimes,
  FaArchive,
  FaSearch,
  FaSyncAlt,
} from "react-icons/fa";
import organizationService from "../services/organizationService";
import { getRoleLabel } from "../constants/roles";
import "../styles/Organizations.css";

const EMPTY_FORM = { name: "", department: "", description: "" };

function Organizations() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ kind: "", message: "", visible: false });
  const [search, setSearch] = useState("");

  // Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  // Invitation code modal
  const [showCodes, setShowCodes] = useState(null);
  const [codes, setCodes] = useState([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [newCode, setNewCode] = useState({ code: "", expires_at: "", max_uses: "" });
  const [generating, setGenerating] = useState(false);

  const showToast = useCallback((kind, message) => {
    setToast({ kind, message, visible: true });
    window.setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 2600);
  }, []);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await organizationService.getOrganizations();
      setOrganizations(data.organizations || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load organizations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const filtered = organizations.filter((o) =>
    !search ||
    (o.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (o.orgCode || "").toLowerCase().includes(search.toLowerCase()) ||
    (o.department || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast("error", "Organization name is required.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await organizationService.updateOrganization(editing.id, form);
        showToast("success", "Organization updated.");
      } else {
        await organizationService.createOrganization(form);
        showToast("success", "Organization created.");
      }
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      setEditing(null);
      await loadOrganizations();
    } catch (err) {
      showToast("error", err.response?.data?.message || err.message || "Failed to save organization.");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (org) => {
    setEditing(org);
    setForm({ name: org.name || "", department: org.department || "", description: org.description || "" });
    setShowCreate(true);
  };

  const handleArchive = async (org) => {
    if (!window.confirm(`Archive organization "${org.name}"? This can be undone by reactivating.`)) return;
    try {
      await organizationService.deleteOrganization(org.id);
      showToast("success", "Organization archived.");
      await loadOrganizations();
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to archive organization.");
    }
  };

  const openCodes = async (org) => {
    setShowCodes(org);
    setNewCode({ code: "", expires_at: "", max_uses: "" });
    setCodesLoading(true);
    try {
      const data = await organizationService.getInvitationCodes(org.id);
      setCodes(data.codes || []);
    } catch (err) {
      setCodes([]);
      showToast("error", err.response?.data?.message || "Failed to load invitation codes.");
    } finally {
      setCodesLoading(false);
    }
  };

  const handleGenerateCode = async (e) => {
    e.preventDefault();
    if (!showCodes) return;
    setGenerating(true);
    try {
      await organizationService.createInvitationCode(showCodes.id, {
        code: newCode.code,
        expires_at: newCode.expires_at || null,
        max_uses: newCode.max_uses ? Number(newCode.max_uses) : undefined,
      });
      showToast("success", "Invitation code created.");
      setNewCode({ code: "", expires_at: "", max_uses: "" });
      const data = await organizationService.getInvitationCodes(showCodes.id);
      setCodes(data.codes || []);
    } catch (err) {
      showToast("error", err.response?.data?.message || err.message || "Failed to create invitation code.");
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleCode = async (code) => {
    const next = code.status === "active" ? "disabled" : "active";
    try {
      await organizationService.updateInvitationCode(code.id, { status: next });
      setCodes((prev) => prev.map((c) => (c.id === code.id ? { ...c, status: next } : c)));
      showToast("success", `Code ${next === "active" ? "activated" : "disabled"}.`);
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to update invitation code.");
    }
  };

  const handleDeleteCode = async (code) => {
    if (!window.confirm(`Delete invitation code "${code.code}"?`)) return;
    try {
      await organizationService.deleteInvitationCode(code.id);
      setCodes((prev) => prev.filter((c) => c.id !== code.id));
      showToast("success", "Invitation code deleted.");
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to delete invitation code.");
    }
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("success", "Copied to clipboard.");
    } catch {
      showToast("error", "Failed to copy.");
    }
  };

  return (
    <div className="org-page">
      {toast.visible && (
        <div className={`org-toast org-toast--${toast.kind}`}>
          {toast.kind === "success" ? <FaCheck /> : <FaTimes />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Hero */}
      <div className="org-hero">
        <div className="org-hero-icon"><FaBuilding /></div>
        <div className="org-hero-text">
          <h2>Organizations</h2>
          <p>Create, manage, and provision invitation codes for organizations.</p>
        </div>
        <button className="org-add-btn" onClick={() => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowCreate(true); }}>
          <FaPlus /> New Organization
        </button>
      </div>

      {/* Toolbar */}
      <div className="org-toolbar">
        <div className="org-search">
          <FaSearch />
          <input
            type="text"
            placeholder="Search by name, code, or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="org-refresh-btn" onClick={loadOrganizations} title="Refresh">
          <FaSyncAlt className={loading ? "org-spin" : ""} />
        </button>
      </div>

      {error && <div className="org-error">{error}</div>}

      {loading ? (
        <div className="org-loading">Loading organizations...</div>
      ) : filtered.length === 0 ? (
        <div className="org-empty">
          <FaBuilding />
          <p>No organizations found.</p>
          <span>Create your first organization to get started.</span>
        </div>
      ) : (
        <div className="org-grid">
          {filtered.map((org) => (
            <div key={org.id} className={`org-card${org.status !== "active" ? " org-card--archived" : ""}`}>
              <div className="org-card-header">
                <div className="org-card-logo">{org.name?.charAt(0)?.toUpperCase() || "O"}</div>
                <div className="org-card-title">
                  <h3>{org.name}</h3>
                  <span className="org-card-code">{org.orgCode}</span>
                </div>
                <span className={`org-status org-status--${org.status}`}>{org.status}</span>
              </div>

              <div className="org-card-body">
                {org.department && (
                  <div className="org-meta">
                    <span className="org-meta-label">Department</span>
                    <span className="org-meta-value">{org.department}</span>
                  </div>
                )}
                {org.description && (
                  <div className="org-meta">
                    <span className="org-meta-label">Description</span>
                    <span className="org-meta-value org-meta-desc">{org.description}</span>
                  </div>
                )}
                <div className="org-meta">
                  <span className="org-meta-label">Members</span>
                  <span className="org-meta-value"><FaUsers /> {org.memberCount ?? 0}</span>
                </div>
                <div className="org-meta">
                  <span className="org-meta-label">Active Codes</span>
                  <span className="org-meta-value"><FaKey /> {org.activeCodeCount ?? 0}</span>
                </div>
              </div>

              <div className="org-card-actions">
                <button onClick={() => openCodes(org)}><FaKey /> Invitation Codes</button>
                <button onClick={() => openEdit(org)}><FaEdit /> Edit</button>
                {org.status === "active" && (
                  <button className="org-btn-danger" onClick={() => handleArchive(org)}><FaArchive /> Archive</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="org-modal-overlay" onClick={() => !saving && setShowCreate(false)}>
          <div className="org-modal" onClick={(e) => e.stopPropagation()}>
            <div className="org-modal-header">
              <h3>{editing ? "Edit Organization" : "Create Organization"}</h3>
              <button className="org-modal-close" onClick={() => setShowCreate(false)}><FaTimes /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="org-form-field">
                <label>Organization Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. BSIT Department" />
              </div>
              <div className="org-form-field">
                <label>Department</label>
                <input type="text" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. College of Engineering" />
              </div>
              <div className="org-form-field">
                <label>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description" rows={3} />
              </div>
              <div className="org-form-actions">
                <button type="button" className="org-btn-cancel" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="org-btn-primary" disabled={saving}>
                  {saving ? "Saving..." : (editing ? "Save Changes" : "Create Organization")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invitation Codes Modal */}
      {showCodes && (
        <div className="org-modal-overlay" onClick={() => setShowCodes(null)}>
          <div className="org-modal org-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="org-modal-header">
              <h3>Invitation Codes — {showCodes.name}</h3>
              <button className="org-modal-close" onClick={() => setShowCodes(null)}><FaTimes /></button>
            </div>

            <form onSubmit={handleGenerateCode} className="org-code-generate">
              <div className="org-form-field">
                <label>Custom Code (optional)</label>
                <input type="text" value={newCode.code} onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })} placeholder="e.g. BSIT-2026" />
              </div>
              <div className="org-form-field">
                <label>Expiration Date (optional)</label>
                <input type="date" value={newCode.expires_at} onChange={(e) => setNewCode({ ...newCode, expires_at: e.target.value })} />
              </div>
              <div className="org-form-field">
                <label>Max Uses (optional)</label>
                <input type="number" min="1" value={newCode.max_uses} onChange={(e) => setNewCode({ ...newCode, max_uses: e.target.value })} placeholder="Unlimited" />
              </div>
              <button type="submit" className="org-btn-primary" disabled={generating}>
                {generating ? "Generating..." : "Generate Code"}
              </button>
            </form>

            <div className="org-codes-list">
              {codesLoading ? (
                <div className="org-loading">Loading codes...</div>
              ) : codes.length === 0 ? (
                <div className="org-empty org-empty--small">
                  <FaKey />
                  <p>No invitation codes yet.</p>
                </div>
              ) : (
                codes.map((code) => (
                  <div key={code.id} className={`org-code-row${code.status !== "active" ? " org-code-row--disabled" : ""}`}>
                    <div className="org-code-info">
                      <div className="org-code-value">
                        <code>{code.code}</code>
                        <button className="org-copy-btn" onClick={() => copyText(code.code)} title="Copy"><FaCopy /></button>
                      </div>
                      <div className="org-code-details">
                        {code.expiresAt && <span>Expires: {new Date(code.expiresAt).toLocaleDateString()}</span>}
                        {code.maxUses > 0 && <span>Uses: {code.usedCount}/{code.maxUses}</span>}
                        {!code.expiresAt && code.maxUses === 0 && <span>Unlimited</span>}
                      </div>
                    </div>
                    <div className="org-code-actions">
                      <span className={`org-status org-status--${code.status}`}>{code.status}</span>
                      <button className="org-btn-toggle" onClick={() => handleToggleCode(code)}>
                        {code.status === "active" ? "Disable" : "Enable"}
                      </button>
                      <button className="org-btn-danger" onClick={() => handleDeleteCode(code)}><FaTrash /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Organizations;
