import { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiCheck, FiClock, FiEdit3, FiFileText, FiPlus, FiUsers, FiX, FiXCircle } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import { hasPermission } from "../context/AuthContext";
import { authFetch } from "../services/apiClient";
import {
  LEAVE_TYPES,
  addManualAdjustment,
  addLeaveRequest,
  getAllParticipantLeaveSummaries,
  getLeaveMonthKey,
  getLeaveRequests,
  getStoredLeaveRecords,
  updateLeaveRequestStatus,
} from "../services/leaveService";
import "../styles/LeaveManagement.css";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDays(value) {
  const numeric = Number(value) || 0;
  return `${numeric} day${numeric === 1 ? "" : "s"}`;
}

export default function LeaveManagement() {
  const { user } = useAuth();
  const currentPeriod = getLeaveMonthKey();
  const currentPeriodLabel = new Date(`${currentPeriod}-01T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "long" });
  const canManageLeave = user?.role === "super_admin" || user?.role === "administrator" || hasPermission(user, "manage_leave");
  const [participants, setParticipants] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [activeModal, setActiveModal] = useState("");
  const [form, setForm] = useState({
    participantId: "",
    leaveType: "sick_leave",
    days: "",
    date: new Date().toISOString().slice(0, 10),
    reason: "",
    adjustmentType: "ADD",
  });

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await authFetch("/participants");
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Failed to load participants");

      const allParticipants = Array.isArray(data?.participants) ? data.participants : [];
      const stored = getStoredLeaveRecords();

      setParticipants(allParticipants);
      setRecords(stored);
    } catch (err) {
      setError(err?.message || "Unable to load leave data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const allSummaries = useMemo(() => getAllParticipantLeaveSummaries(participants, records), [participants, records]);
  const pendingRequests = useMemo(() => getLeaveRequests(records), [records]);

  const stats = useMemo(() => {
    const approvedDays = records
      .filter((record) => String(record.status || "").toLowerCase() === "approved" && !record.isAdjustment)
      .filter((record) => getLeaveMonthKey(record.startDate || record.date || record.submittedAt) === getLeaveMonthKey())
      .reduce((sum, record) => sum + Number(record.days || 0), 0);

    const totalRemaining = allSummaries.reduce((sum, item) => sum + Number(item.totalRemaining || 0), 0);
    return {
      totalParticipants: participants.length,
      pendingRequests: pendingRequests.length,
      approvedLeaveDays: approvedDays,
      remainingLeaveDays: totalRemaining,
    };
  }, [participants, pendingRequests, records, allSummaries]);

  const handleAdjustmentSubmit = (event) => {
    event.preventDefault();

    if (!form.participantId) {
      setToast("Select a participant first.");
      return;
    }
    if (!form.leaveType) {
      setToast("Select a leave type.");
      return;
    }
    if (!Number(form.days) || Number(form.days) <= 0) {
      setToast("Leave days must be greater than zero.");
      return;
    }

    try {
      const selectedParticipant = participants.find((p) => String(p.id) === String(form.participantId));
      addManualAdjustment({
        participantId: form.participantId,
        userId: selectedParticipant?.userId ?? selectedParticipant?.user_id ?? user?.id,
        organizationId: selectedParticipant?.organizationId ?? selectedParticipant?.organization_id ?? null,
        leaveType: form.leaveType,
        days: form.days,
        date: form.date,
        reason: form.reason || `Manual ${form.adjustmentType.toLowerCase()} adjustment`,
        adjustmentType: form.adjustmentType,
      });

      setToast("Manual adjustment recorded.");
      setForm({
        participantId: "",
        leaveType: "sick_leave",
        days: "",
        date: new Date().toISOString().slice(0, 10),
        reason: "",
        adjustmentType: "ADD",
      });
      loadData();
    } catch (err) {
      setToast(err?.message || "Unable to save adjustment.");
    }
  };

  const handleApprove = (recordId) => {
    if (!canManageLeave) return;
    const record = records.find((item) => String(item.id) === String(recordId));
    if (!record) return;

    try {
      updateLeaveRequestStatus(recordId, "approved", user?.id);
      setToast("Leave request approved.");
      loadData();
    } catch (err) {
      setToast(err?.message || "Unable to approve leave request.");
    }
  };

  const handleReject = (recordId) => {
    if (!canManageLeave) return;
    updateLeaveRequestStatus(recordId, "rejected", user?.id);
    setToast("Leave request rejected.");
    loadData();
  };

  const handleRequestSubmit = (event) => {
    event.preventDefault();
    const selectedParticipant = participants.find((item) => String(item.id) === String(form.participantId));
    if (!selectedParticipant) {
      setToast("Select a valid participant.");
      return;
    }

    try {
      addLeaveRequest({
        participantId: selectedParticipant.id,
        userId: selectedParticipant.userId ?? selectedParticipant.user_id ?? user?.id,
        organizationId: selectedParticipant.organizationId ?? selectedParticipant.organization_id ?? null,
        leaveType: form.leaveType,
        startDate: form.date,
        endDate: form.date,
        days: form.days,
        reason: form.reason || "Requested leave",
        status: "pending",
      });
      setToast("Leave request submitted for review.");
      setForm({
        participantId: "",
        leaveType: "sick_leave",
        days: "",
        date: new Date().toISOString().slice(0, 10),
        reason: "",
        adjustmentType: "ADD",
      });
      loadData();
    } catch (err) {
      setToast(err?.message || "Unable to submit leave request.");
    }
  };

  const participantName = (participant) => participant
    ? `${participant.firstName || ""} ${participant.lastName || ""}`.trim() || participant.participantIdentifier || participant.studentNumber || `Participant ${participant.id}`
    : "Unknown";

  const renderForm = (type) => (
    <form className="leave-form" onSubmit={(event) => {
      if (type === "adjustment") handleAdjustmentSubmit(event);
      else handleRequestSubmit(event);
      setActiveModal("");
    }}>
      <label>
        Participant
        <select value={form.participantId} onChange={(event) => setForm((prev) => ({ ...prev, participantId: event.target.value }))}>
          <option value="">Select participant</option>
          {participants.map((participant) => <option key={participant.id} value={participant.id}>{participantName(participant)}</option>)}
        </select>
      </label>
      <label>
        Leave Type
        <select value={form.leaveType} onChange={(event) => setForm((prev) => ({ ...prev, leaveType: event.target.value }))}>
          {LEAVE_TYPES.map((leaveType) => <option key={leaveType.key} value={leaveType.key}>{leaveType.label}</option>)}
        </select>
      </label>
      <label>
        Number of Days
        <input type="number" min="1" value={form.days} onChange={(event) => setForm((prev) => ({ ...prev, days: event.target.value }))} />
      </label>
      <label>
        Date
        <input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
      </label>
      {type === "adjustment" && <label>
        Adjustment Type
        <select value={form.adjustmentType} onChange={(event) => setForm((prev) => ({ ...prev, adjustmentType: event.target.value }))}>
          <option value="ADD">ADD</option><option value="DEDUCT">DEDUCT</option>
        </select>
      </label>}
      <label>
        {type === "adjustment" ? "Reason / Adjustment Note" : "Reason"}
        <textarea rows="3" value={form.reason} onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))} />
      </label>
      <button type="submit" className="leave-primary-btn"><FiCheck /> {type === "adjustment" ? "Save Adjustment" : "Submit Request"}</button>
    </form>
  );

  return (
    <div className="leave-page">
      <header className="leave-header">
          <div><p className="leave-eyebrow">Leave Management</p><h1>Leave Dashboard</h1><p className="leave-subtitle">{currentPeriodLabel} · Keep every participant's time away organized and visible.</p></div>
      </header>
      {toast && <div className="leave-toast">{toast}</div>}
      {error && <div className="leave-alert leave-alert--error">{error}</div>}

      {!loading && <>
        <section className="leave-summary-grid">
          {[{ label: "Total Participants", value: stats.totalParticipants, icon: FiUsers, tone: "blue" }, { label: "Pending Requests", value: stats.pendingRequests, icon: FiClock, tone: "amber" }, { label: "Approved Leave Days", value: stats.approvedLeaveDays, icon: FiCheck, tone: "green" }, { label: "Remaining Leave Days", value: stats.remainingLeaveDays, icon: FiCalendar, tone: "purple" }].map(({ label, value, icon: Icon, tone }) => (
            <div className="leave-stat-card" key={label}><span className={`leave-stat-icon leave-stat-icon--${tone}`}><Icon /></span><div><span>{label}</span><strong>{value}</strong></div></div>
          ))}
        </section>

        <section className="leave-panel leave-balances-panel">
          <div className="leave-section-heading"><div><p className="leave-kicker">Overview</p><h2>Participant Leave Balances</h2></div><span className="leave-count">{allSummaries.length} participants</span></div>
          <div className="leave-table-wrap"><table className="leave-table"><thead><tr><th>Participant</th><th>Organization</th><th>Department / Group</th>{LEAVE_TYPES.map((type) => <th key={type.key}>{type.label}</th>)}<th>Total Remaining</th></tr></thead><tbody>
            {allSummaries.length === 0 ? <tr><td colSpan="9" className="leave-empty">No participants found</td></tr> : allSummaries.map((summary) => <tr key={summary.participantId ?? summary.participantName}><td><strong>{summary.participantName}</strong><small className="leave-muted">ID: {summary.participantId ?? "—"}</small></td><td>{summary.organization}</td><td>{summary.department}</td>{summary.typeSummaries.map((item) => <td key={`${summary.participantId}-${item.typeKey}`}><span className={`leave-balance-pill leave-balance-pill--${getLowBalanceTone(item.remaining, item.allocation)} leave-type--${item.typeKey}`}>{item.remaining} / {item.allocation}</span><small className="leave-balance-used">{item.used} used · {item.pending} pending</small></td>)}<td><strong className="leave-total-days">{summary.totalRemaining} days</strong></td></tr>)}
          </tbody></table></div>
        </section>

        <section className="leave-panel">
          <div className="leave-section-heading"><div><p className="leave-kicker">Needs attention</p><h2>Pending Leave Requests</h2></div><span className="leave-count leave-count--amber">{pendingRequests.length} pending</span></div>
          <div className="leave-request-list">{pendingRequests.length === 0 ? <div className="leave-empty leave-empty--block"><FiCheck /><span>No pending requests right now</span></div> : pendingRequests.map((record) => { const participant = participants.find((item) => String(item.id) === String(record.participantId)); const leaveType = LEAVE_TYPES.find((type) => type.key === record.leaveType); return <article className="leave-request-row" key={record.id}><div className="leave-request-person"><span className="leave-avatar">{participantName(participant).charAt(0)}</span><div><strong>{participantName(participant)}</strong><small>ID: {record.participantId}</small></div></div><div><span className={`leave-type-badge leave-type-badge--${record.leaveType}`}>{leaveType?.label || record.leaveType}</span></div><div className="leave-request-meta"><span><FiFileText /> {formatDays(record.days)}</span><span><FiCalendar /> {formatDate(record.startDate)}</span></div><span className={`leave-status leave-status--${getStatusTone(record.status)}`}>{record.status}</span><div className="leave-actions">{canManageLeave && <><button type="button" className="leave-action-btn leave-action-btn--approve" onClick={() => handleApprove(record.id)}><FiCheck /> Approve</button><button type="button" className="leave-action-btn leave-action-btn--reject" onClick={() => handleReject(record.id)}><FiXCircle /> Reject</button></>}<button type="button" className="leave-action-btn leave-action-btn--details" onClick={() => setSelectedRequestId(selectedRequestId === record.id ? "" : record.id)}>Details</button></div>{selectedRequestId === record.id && <div className="leave-request-detail"><strong>Detail</strong><p>{record.reason || "No reason provided"}</p><p>{formatDate(record.startDate)} to {formatDate(record.endDate)} · {formatDays(record.days)}</p></div>}</article>; })}</div>
        </section>

        <section className="leave-quick-actions"><div><p className="leave-kicker">Shortcuts</p><h2>Quick Actions</h2><p>Update balances or send a request without leaving this overview.</p></div><div className="leave-quick-action-buttons"><button type="button" className="leave-primary-btn" onClick={() => setActiveModal("request")}><FiPlus /> New Leave Request</button>{canManageLeave && <button type="button" className="leave-secondary-btn" onClick={() => setActiveModal("adjustment")}><FiEdit3 /> Adjust Leave Balance</button>}</div></section>
      </>}
      {loading && <div className="leave-loader">Loading leave data…</div>}

      {activeModal && <div className="leave-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveModal(""); }}><div className="leave-modal" role="dialog" aria-modal="true" aria-labelledby="leave-modal-title"><div className="leave-modal-header"><div><p className="leave-kicker">Leave Management</p><h2 id="leave-modal-title">{activeModal === "adjustment" ? "Adjust Leave Balance" : "New Leave Request"}</h2></div><button type="button" className="leave-close-btn" onClick={() => setActiveModal("")} aria-label="Close modal"><FiX /></button></div>{renderForm(activeModal)}</div></div>}
    </div>
  );
}
/*
              <form className="leave-form" onSubmit={handleAdjustmentSubmit}>
                <label>
                  Participant
                  <select value={form.participantId} onChange={(event) => setForm((prev) => ({ ...prev, participantId: event.target.value }))}>
                    <option value="">Select participant</option>
                    {participants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.firstName || participant.lastName ? `${participant.firstName || ""} ${participant.lastName || ""}`.trim() : participant.participantIdentifier || participant.studentNumber || `Participant ${participant.id}`}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Leave Type
                  <select value={form.leaveType} onChange={(event) => setForm((prev) => ({ ...prev, leaveType: event.target.value }))}>
                    {LEAVE_TYPES.map((type) => (
                      <option key={type.key} value={type.key}>{type.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Days
                  <input type="number" min="1" value={form.days} onChange={(event) => setForm((prev) => ({ ...prev, days: event.target.value }))} />
                </label>

                <label>
                  Date
                  <input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
                </label>

                <label>
                  Adjustment Type
                  <select value={form.adjustmentType} onChange={(event) => setForm((prev) => ({ ...prev, adjustmentType: event.target.value }))}>
                    <option value="ADD">ADD</option>
                    <option value="DEDUCT">DEDUCT</option>
                  </select>
                </label>

                <label>
                  Reason / Adjustment Note
                  <textarea rows="3" value={form.reason} onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))} />
                </label>

                <button type="submit" className="leave-primary-btn">Save Adjustment</button>
              </form>
            </div>

            <div className="leave-panel">
              <h2>New Leave Request</h2>
              <form className="leave-form" onSubmit={handleRequestSubmit}>
                <label>
                  Participant
                  <select value={form.participantId} onChange={(event) => setForm((prev) => ({ ...prev, participantId: event.target.value }))}>
                    <option value="">Select participant</option>
                    {participants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.firstName || participant.lastName ? `${participant.firstName || ""} ${participant.lastName || ""}`.trim() : participant.participantIdentifier || participant.studentNumber || `Participant ${participant.id}`}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Leave Type
                  <select value={form.leaveType} onChange={(event) => setForm((prev) => ({ ...prev, leaveType: event.target.value }))}>
                    {LEAVE_TYPES.map((type) => (
                      <option key={type.key} value={type.key}>{type.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Number of Days
                  <input type="number" min="1" value={form.days} onChange={(event) => setForm((prev) => ({ ...prev, days: event.target.value }))} />
                </label>

                <label>
                  Date
                  <input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
                </label>

                <label>
                  Reason
                  <textarea rows="3" value={form.reason} onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))} />
                </label>

                <button type="submit" className="leave-primary-btn">Submit Request</button>
              </form>
            </div>
          </section>

          <section className="leave-panel">
            <h2>Participant Leave Balances</h2>
            <div className="leave-table-wrap">
              <table className="leave-table">
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Participant ID</th>
                    <th>Organization</th>
                    <th>Department / Group</th>
                    <th>Sick Leave</th>
                    <th>Personal Leave</th>
                    <th>Emergency Leave</th>
                    <th>Mental Health</th>
                    <th>Academic</th>
                    <th>Total Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {allSummaries.map((summary) => (
                    <tr key={summary.participantId ?? summary.participantName}>
                      <td>{summary.participantName}</td>
                      <td>{summary.participantId ?? "—"}</td>
                      <td>{summary.organization}</td>
                      <td>{summary.department}</td>
                      {summary.typeSummaries.map((item) => (
                        <td key={`${summary.participantId}-${item.typeKey}`}>
                          <span className={`leave-balance-pill leave-balance-pill--${getLowBalanceTone(item.remaining, item.allocation)}`}>
                            {item.remaining} / {item.allocation}
                          </span>
                        </td>
                      ))}
                      <td><strong>{summary.totalRemaining}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="leave-panel">
            <h2>Leave Requests</h2>
            <div className="leave-table-wrap">
              <table className="leave-table">
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Participant ID</th>
                    <th>Leave Type</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Days</th>
                    <th>Reason</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRequests.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="leave-empty">No pending requests</td>
                    </tr>
                  ) : (
                    pendingRequests.map((record) => {
                      const participant = participants.find((item) => String(item.id) === String(record.participantId));
                      const participantName = participant
                        ? `${participant.firstName || ""} ${participant.lastName || ""}`.trim() || participant.participantIdentifier || participant.studentNumber || `Participant ${participant.id}`
                        : "Unknown";

                      return (
                        <tr key={record.id}>
                          <td>{participantName}</td>
                          <td>{record.participantId}</td>
                          <td>{LEAVE_TYPES.find((type) => type.key === record.leaveType)?.label || record.leaveType}</td>
                          <td>{formatDate(record.startDate)}</td>
                          <td>{formatDate(record.endDate)}</td>
                          <td>{record.days}</td>
                          <td>{record.reason || "—"}</td>
                          <td>{formatDate(record.submittedAt)}</td>
                          <td>
                            <span className={`leave-status leave-status--${getStatusTone(record.status)}`}>{record.status}</span>
                          </td>
                          <td>
                            <div className="leave-actions">
                              <button type="button" className="leave-action-btn leave-action-btn--approve" onClick={() => handleApprove(record.id)}>APPROVE</button>
                              <button type="button" className="leave-action-btn leave-action-btn--reject" onClick={() => handleReject(record.id)}>REJECT</button>
                              <button type="button" className="leave-action-btn" onClick={() => setSelectedRequestId(selectedRequestId === record.id ? "" : record.id)}>VIEW DETAILS</button>
                            </div>
                            {selectedRequestId === record.id && (
                              <div className="leave-request-detail">
                                <strong>Detail</strong>
                                <p>{record.reason || "No reason provided"}</p>
                                <p>{formatDate(record.startDate)} to {formatDate(record.endDate)} · {formatDays(record.days)}</p>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {loading && <div className="leave-loader">Loading leave data…</div>}
    </div>
  );
}
*/
