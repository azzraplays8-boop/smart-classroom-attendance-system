import { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiCheck, FiClock, FiFileText, FiPlus, FiSend } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import { authFetch } from "../services/apiClient";
import {
  LEAVE_TYPES,
  addLeaveRequest,
  getCurrentParticipantForUser,
  getLeaveSummaryForCurrentUser,
  getLowBalanceTone,
  getStatusTone,
  getStoredLeaveRecords,
} from "../services/leaveService";
import "../styles/LeaveManagement.css";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function MyLeave() {
  const { user } = useAuth();
  const [participants, setParticipants] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [form, setForm] = useState({ leaveType: "sick_leave", days: "", startDate: "", endDate: "", reason: "" });

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await authFetch("/participants");
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Failed to load your participant records");
      setParticipants(Array.isArray(data?.participants) ? data.participants : []);
      setRecords(getStoredLeaveRecords());
    } catch (err) {
      setError(err?.message || "Unable to load your leave information.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const currentParticipant = useMemo(
    () => getCurrentParticipantForUser(user, participants),
    [user, participants]
  );

  const summary = useMemo(
    () => getLeaveSummaryForCurrentUser(user, participants, records),
    [user, participants, records]
  );

  const history = useMemo(
    () => records.filter((record) => {
      if (!currentParticipant) return false;
      return String(record.participantId ?? "") === String(currentParticipant.id) || String(record.userId ?? "") === String(user?.id ?? "");
    }).sort((a, b) => new Date(b.submittedAt || b.startDate || 0) - new Date(a.submittedAt || a.startDate || 0)),
    [records, currentParticipant, user]
  );

  const selectedBalance = summary.typeSummaries.find((item) => item.typeKey === form.leaveType) || summary.typeSummaries[0];

  const closeModal = () => {
    if (!isSubmitting) setIsModalOpen(false);
  };

  const handleRequestSubmit = (event) => {
    event.preventDefault();
    const days = Number(form.days);
    const leaveType = LEAVE_TYPES.find((type) => type.key === form.leaveType);

    if (!form.leaveType) {
      setNotice({ type: "error", message: "Leave type is required." });
      return;
    }
    if (!Number.isFinite(days) || days <= 0) {
      setNotice({ type: "error", message: "Number of days must be greater than zero." });
      return;
    }
    if (days > Number(selectedBalance?.remaining || 0)) {
      setNotice({ type: "error", message: `You only have ${selectedBalance.remaining} ${leaveType?.label || "leave"} days remaining.` });
      return;
    }
    if (!form.startDate || !form.endDate) {
      setNotice({ type: "error", message: "Start date and end date are required." });
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setNotice({ type: "error", message: "End date cannot be before start date." });
      return;
    }
    if (!form.reason.trim()) {
      setNotice({ type: "error", message: "Please provide a reason for your request." });
      return;
    }

    setIsSubmitting(true);
    setNotice({ type: "", message: "" });
    try {
      addLeaveRequest({
        participantId: currentParticipant.id,
        userId: currentParticipant.userId ?? currentParticipant.user_id ?? user?.id,
        organizationId: currentParticipant.organizationId ?? currentParticipant.organization_id ?? null,
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        days,
        reason: form.reason.trim(),
      });
      setRecords(getStoredLeaveRecords());
      setForm({ leaveType: "sick_leave", days: "", startDate: "", endDate: "", reason: "" });
      setIsModalOpen(false);
      setNotice({ type: "success", message: "Leave request submitted successfully." });
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Unable to submit leave request." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="leave-loader">Loading your leave details…</div>;
  }

  if (error) {
    return <div className="leave-alert leave-alert--error">{error}</div>;
  }

  if (!currentParticipant) {
    return (
      <div className="leave-page">
        <div className="leave-alert">
          Your account is not yet linked to a participant record. Please contact an administrator.
        </div>
      </div>
    );
  }

  return (
    <div className="leave-page">
      <header className="leave-header">
        <div>
          <p className="leave-eyebrow">My Leave</p>
          <h1>My Leave</h1>
          <p className="leave-subtitle">Manage your leave requests and view your remaining leave balance.</p>
        </div>
        <button type="button" className="leave-primary-btn" onClick={() => { setNotice({ type: "", message: "" }); setIsModalOpen(true); }}><FiPlus /> Request Leave</button>
      </header>

      {notice.message && <div className={`leave-alert leave-alert--${notice.type}`}>{notice.message}</div>}

      <section className="leave-summary-grid">
        <div className="leave-stat-card"><span className="leave-stat-icon leave-stat-icon--blue"><FiCalendar /></span><div><span>Total Available</span><strong>{summary.totalRemaining}</strong><small>days remaining</small></div></div>
        <div className="leave-stat-card"><span className="leave-stat-icon leave-stat-icon--green"><FiCheck /></span><div><span>Total Used</span><strong>{summary.totalUsed}</strong><small>approved days</small></div></div>
        <div className="leave-stat-card"><span className="leave-stat-icon leave-stat-icon--amber"><FiClock /></span><div><span>Pending Requests</span><strong>{history.filter((record) => record.status === "pending").length}</strong><small>awaiting review</small></div></div>
      </section>

      <section>
        <div className="leave-section-heading"><div><p className="leave-kicker">Your allowance</p><h2>Leave Balance</h2></div></div>
        <div className="leave-balance-grid">
          {summary.typeSummaries.map((item) => (
            <article key={item.typeKey} className={`leave-balance-card leave-balance-card--${item.typeKey}`}>
              <div className="leave-balance-card__top"><span className="leave-type-icon"><FiFileText /></span><span className={`leave-status leave-status--${getLowBalanceTone(item.remaining, item.allocation)}`}>{item.remaining} available</span></div>
              <h3>{item.label}</h3>
              <div className="leave-balance-card__details"><span>{item.allocation} days allocated</span><span>{item.used} day{item.used === 1 ? "" : "s"} used</span><span>{item.pending} pending</span></div>
              <strong className="leave-remaining">{item.remaining} <small>DAYS REMAINING</small></strong>
            </article>
          ))}
        </div>
      </section>

      <section className="leave-panel leave-history-panel">
        <div className="leave-section-heading"><div><p className="leave-kicker">Your activity</p><h2>My Leave Requests</h2></div><span className="leave-count">{history.length} request{history.length === 1 ? "" : "s"}</span></div>
        <div className="leave-table-wrap leave-viewer-table-wrap">
          <table className="leave-table">
            <thead>
              <tr>
                <th>Leave Type</th>
                <th>Date</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Date Submitted</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="6" className="leave-empty">No leave requests yet.<small>Request your first leave using the button above.</small></td>
                </tr>
              ) : (
                history.map((record) => (
                  <tr key={record.id}>
                    <td>{LEAVE_TYPES.find((type) => type.key === record.leaveType)?.label || record.leaveType}</td>
                    <td>{formatDate(record.startDate)}{record.endDate && record.endDate !== record.startDate ? ` - ${formatDate(record.endDate)}` : ""}</td>
                    <td>{record.days}</td>
                    <td>{record.reason || "—"}</td>
                    <td><span className={`leave-status leave-status--${getStatusTone(record.status)}`}>{String(record.status || "pending").toUpperCase()}</span><small className="leave-status-note">{record.status === "pending" ? "Waiting for Admin approval" : record.status === "approved" ? "Approved" : "Rejected"}{record.rejectionReason ? `: ${record.rejectionReason}` : ""}</small></td>
                    <td>{formatDate(record.submittedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && <div className="leave-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}><div className="leave-modal" role="dialog" aria-modal="true" aria-labelledby="viewer-leave-modal-title"><div className="leave-modal-header"><div><p className="leave-kicker">New request</p><h2 id="viewer-leave-modal-title">Request Leave</h2></div><button type="button" className="leave-close-btn" onClick={closeModal} aria-label="Close request form">x</button></div><form className="leave-form" onSubmit={handleRequestSubmit}>
        <label>Leave Type<select value={form.leaveType} onChange={(event) => setForm((prev) => ({ ...prev, leaveType: event.target.value }))}>{LEAVE_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</select></label>
        <div className="leave-available-note">You have <strong>{selectedBalance?.remaining || 0} days remaining.</strong></div>
        <label>Number of Days<input type="number" min="1" max={selectedBalance?.remaining || 0} value={form.days} onChange={(event) => setForm((prev) => ({ ...prev, days: event.target.value }))} /></label>
        <div className="leave-form-row"><label>Start Date<input type="date" value={form.startDate} onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))} /></label><label>End Date<input type="date" min={form.startDate || undefined} value={form.endDate} onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))} /></label></div>
        <label>Reason<textarea rows="3" value={form.reason} onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))} /></label>
        <div className="leave-form-actions"><button type="button" className="leave-secondary-btn" onClick={closeModal} disabled={isSubmitting}>Cancel</button><button type="submit" className="leave-primary-btn" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : <><FiSend /> Submit Leave Request</>}</button></div>
      </form></div></div>}
    </div>
  );
}
