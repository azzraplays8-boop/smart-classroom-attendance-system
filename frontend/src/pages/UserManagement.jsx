/**
 * UserManagement — Enterprise user management & approval workflow.
 * Admin+ only. Handles pending approvals, role assignment, org assignment,
 * activate/deactivate, search, and filtering.
 */
import { useCallback, useEffect, useState } from "react";
import {
  FaUsersCog,
  FaSearch,
  FaCheck,
  FaTimes,
  FaUserCheck,
  FaUserLock,
  FaUserEdit,
  FaTrash,
  FaKey,
  FaSyncAlt,
  FaClock,
  FaBuilding,
  FaShieldAlt,
} from "react-icons/fa";
import authService from "../services/authService";
import organizationService from "../services/organizationService";
import { ROLE_OPTIONS, getRoleLabel } from "../constants/roles";
import "../styles/UserManagement.css";

const ROLE_COLORS = {
  super_admin: "#8b5cf6",
  administrator: "#2563eb",
  teacher: "#16a34a",
  moderator: "#d97706",
  encoder: "#0891b2",
  viewer: "#64748b",
};

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ kind: "", message: "", visible: false });

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modal state
  const [editingUser, setEditingUser] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [approveForm, setApproveForm] = useState({ role: "viewer", organization_id: "" });
  const [saving, setSaving] = useState(false);

  const showToast = useCallback((kind, message) => {
    setToast({ kind, message, visible: true });
    window.setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 2600);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [usersData, pendingData, orgData] = await Promise.all([
        authService.getUsers(),
        authService.getPending().catch(() => ({ pending: [] })),
        organizationService.getOrganizations().catch(() => ({ organizations: [] })),
      ]);
      setUsers(usersData.users || []);
      setPending(pendingData.pending || []);
      setOrganizations(orgData.organizations || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filteredUsers = users.filter((u) => {
    if (search && !((u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
        (u.username || "").toLowerCase().includes(search.toLowerCase()))) return false;
    if (roleFilter && u.role !== roleFilter) return false;
    if (orgFilter && String(u.organization_id) !== orgFilter) return false;
    if (statusFilter) {
      const status = u.account_status || (u.is_active ? "approved" : "deactivated");
      if (status !== statusFilter) return false;
    }
    return true;
  });

  const handleApprove = async (e) => {
    e.preventDefault();
    if (!pendingAction) return;
    setSaving(true);
    try {
      await authService.approvePending(pendingAction.id, {
        role: approveForm.role,
        organization_id: approveForm.organization_id ? Number(approveForm.organization_id) : undefined,
      });
      showToast("success", "Registration approved successfully. Participant profile created.");
      setPendingAction(null);
      await loadAll();
    } catch (err) {
      showToast("error", err.response?.data?.message || err.message || "Failed to approve.");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (p) => {
    if (!window.confirm(`Reject registration for ${p.full_name}?`)) return;
    try {
      await authService.rejectPending(p.id);
      showToast("success", "Registration rejected.");
      await loadAll();
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to reject.");
    }
  };

  const handleRoleChange = async (user, newRole) => {
    if (newRole === user.role) return;
    try {
      await authService.assignRole(user.id, newRole);
      showToast("success", `Role updated to ${getRoleLabel(newRole)}.`);
      await loadAll();
    } catch (err) {
      showToast("error", err.response?.data?.message || err.message || "Failed to update role.");
    }
  };

  const handleOrgChange = async (user, newOrgId) => {
    const orgId = newOrgId ? Number(newOrgId) : null;
    if (String(user.organization_id) === String(orgId)) return;
    try {
      await authService.assignOrganization(user.id, orgId);
      showToast("success", "Organization updated.");
      await loadAll();
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to update organization.");
    }
  };

  const handleToggleStatus = async (user) => {
    const activating = user.is_active === 0 || user.account_status === "deactivated" || user.account_status === "rejected";
    try {
      await authService.setUserStatus(user.id, activating ? 1 : 0);
      showToast("success", activating ? "User activated." : "User deactivated.");
      await loadAll();
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to update status.");
    }
  };

  const handleResetPassword = async (user) => {
    const newPw = window.prompt(`Enter a new password for ${user.full_name}:`);
    if (!newPw) return;
    try {
      await authService.resetPassword(user.id, newPw);
      showToast("success", "Password reset.");
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to reset password.");
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user ${user.full_name}? This cannot be undone.`)) return;
    try {
      await authService.deleteUser(user.id);
      showToast("success", "User deleted.");
      await loadAll();
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to delete user.");
    }
  };

  const statusBadge = (u) => {
    const status = u.account_status || (u.is_active ? "approved" : "deactivated");
    return <span className={`um-status um-status--${status}`}>{status}</span>;
  };

  const roleBadge = (role) => (
    <span className="um-role" style={{ background: `${ROLE_COLORS[role]}1f`, color: ROLE_COLORS[role] }}>
      {getRoleLabel(role)}
    </span>
  );

  return (
    <div className="um-page">
      {toast.visible && (
        <div className={`um-toast um-toast--${toast.kind}`}>
          {toast.kind === "success" ? <FaCheck /> : <FaTimes />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Hero */}
      <div className="um-hero">
        <div className="um-hero-icon"><FaUsersCog /></div>
        <div className="um-hero-text">
          <h2>User Management</h2>
          <p>Manage users, roles, organizations, and pending approvals.</p>
        </div>
      </div>

      {/* Pending Approvals */}
      <div className="um-section">
        <div className="um-section-header">
          <h3><FaClock /> Pending Approvals</h3>
          {pending.length > 0 && <span className="um-pending-count">{pending.length}</span>}
        </div>
        {pending.length === 0 ? (
          <div className="um-empty um-pending-empty">
            <FaUserCheck />
            <p>No pending registrations.</p>
          </div>
        ) : (
          <div className="um-pending-list">
            {pending.map((p) => (
              <div key={p.id} className="um-pending-card">
                <div className="um-pending-info">
                  <div className="um-pending-avatar">{p.full_name?.charAt(0)?.toUpperCase() || "U"}</div>
                  <div className="um-pending-details">
                    <span className="um-pending-name">{p.full_name}</span>
                    <span className="um-pending-email">{p.email} • @{p.username}</span>
                    <span className="um-pending-org">
                      <FaBuilding /> {p.organization_name || "No organization"}
                    </span>
                    {p.invitationCode && (
                      <span className="um-pending-code">Invited via: <code>{p.invitationCode}</code></span>
                    )}
                  </div>
                </div>
                <div className="um-pending-actions">
                  <button className="um-btn-approve" onClick={() => {
                    setApproveForm({ role: "viewer", organization_id: p.organizationId ? String(p.organizationId) : "" });
                    setPendingAction(p);
                  }}>
                    <FaUserCheck /> Approve
                  </button>
                  <button className="um-btn-reject" onClick={() => handleReject(p)}>
                    <FaTimes /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Users */}
      <div className="um-section">
        <div className="um-section-header">
          <h3><FaUsersCog /> Users</h3>
          <span className="um-user-count">{users.length} total</span>
        </div>

        {/* Filters */}
        <div className="um-filters">
          <div className="um-search">
            <FaSearch />
            <input type="text" placeholder="Search name, email, username..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            <option value="super_admin">Super Admin</option>
          </select>
          <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
            <option value="">All Organizations</option>
            {organizations.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="deactivated">Deactivated</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {error && <div className="um-error">{error}</div>}

        {loading ? (
          <div className="um-loading">Loading...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="um-empty">
            <FaSearch />
            <p>No users match your filters.</p>
          </div>
        ) : (
          <div className="um-table-wrap">
            <table className="um-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Organization</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="um-user-cell">
                        <div className="um-user-avatar">{u.full_name?.charAt(0)?.toUpperCase() || "U"}</div>
                        <div className="um-user-meta">
                          <span className="um-user-name">{u.full_name}</span>
                          <span className="um-user-email">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        className="um-role-select"
                        value={u.role}
                        onChange={(e) => handleRoleChange(u, e.target.value)}
                      >
                        {u.role === "super_admin" ? (
                          <option value="super_admin">Super Admin</option>
                        ) : (
                          <>
                            <option value="">Select role...</option>
                            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </>
                        )}
                      </select>
                      {u.role !== "super_admin" && roleBadge(u.role)}
                    </td>
                    <td>
                      <select
                        className="um-org-select"
                        value={u.organization_id ? String(u.organization_id) : ""}
                        onChange={(e) => handleOrgChange(u, e.target.value)}
                      >
                        <option value="">No organization</option>
                        {organizations.map((o) => (
                          <option key={o.id} value={String(o.id)}>{o.name}</option>
                        ))}
                      </select>
                      {u.organization_name && <span className="um-org-name">{u.organization_name}</span>}
                    </td>
                    <td>{statusBadge(u)}</td>
                    <td>
                      <div className="um-actions">
                        <button
                          className="um-action um-action--toggle"
                          title={u.is_active ? "Deactivate" : "Activate"}
                          onClick={() => handleToggleStatus(u)}
                        >
                          {u.is_active ? <FaUserLock /> : <FaUserCheck />}
                        </button>
                        <button
                          className="um-action"
                          title="Reset password"
                          onClick={() => handleResetPassword(u)}
                        >
                          <FaKey />
                        </button>
                        <button
                          className="um-action um-action--danger"
                          title="Delete user"
                          onClick={() => handleDelete(u)}
                          disabled={u.role === "super_admin"}
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approve Modal */}
      {pendingAction && (
        <div className="um-modal-overlay" onClick={() => !saving && setPendingAction(null)}>
          <div className="um-modal" onClick={(e) => e.stopPropagation()}>
            <div className="um-modal-header">
              <h3><FaUserCheck /> Approve Registration</h3>
              <button className="um-modal-close" onClick={() => setPendingAction(null)}><FaTimes /></button>
            </div>
            <div className="um-approve-user">
              <div className="um-user-avatar um-pending-avatar">{pendingAction.full_name?.charAt(0)?.toUpperCase() || "U"}</div>
              <div>
                <div className="um-user-name">{pendingAction.full_name}</div>
                <div className="um-user-email">{pendingAction.email}</div>
              </div>
            </div>
            <form onSubmit={handleApprove}>
              <div className="um-form-field">
                <label><FaShieldAlt /> Assign Role</label>
                <select value={approveForm.role} onChange={(e) => setApproveForm({ ...approveForm, role: e.target.value })}>
                  {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="um-form-field">
                <label><FaBuilding /> Assign Organization</label>
                <select value={approveForm.organization_id} onChange={(e) => setApproveForm({ ...approveForm, organization_id: e.target.value })}>
                  <option value="">No organization</option>
                  {organizations.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
                </select>
              </div>
              <div className="um-modal-actions">
                <button type="button" className="um-btn-cancel" onClick={() => setPendingAction(null)} disabled={saving}>Cancel</button>
                <button type="submit" className="um-btn-approve um-btn-submit" disabled={saving}>
                  {saving ? "Approving..." : "Approve & Activate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
