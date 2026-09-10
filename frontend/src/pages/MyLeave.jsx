import { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiCheck, FiClock, FiFileText, FiPlus, FiSend } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import { authFetch } from "../services/apiClient";
import {
  LEAVE_TYPES,
  cancelLeaveRequest,
  createLeaveRequest,
  fetchLeaveBalances,
  fetchLeaveRequests,
  getCurrentParticipantForUser,
  getLeaveSummaryForCurrentUser,
  getLowBalanceTone,
  getStatusTone,
} from "../services/leaveService";
import "../styles/LeaveManagement.css";

function parseLocalDate(value) {
  if (!value || typeof value !== "string") return null;
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatLocalISO(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayLocalISO() {
  const today = new Date();
  return formatLocalISO(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
}

function addLocalDays(dateString, daysToAdd) {
  const baseDate = parseLocalDate(dateString);
  if (!baseDate) return "";
  const days = Number(daysToAdd) || 0;
  const nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + days);
  return formatLocalISO(nextDate);
}

function getEndDateFromDays(startDate, days) {
  const numericDays = Number(days) || 0;
  if (!startDate || numericDays <= 0) return "";
  return addLocalDays(startDate, numericDays - 1);
}

function formatDate(value) {
  if (!value) return "—";
  const date = parseLocalDate(value) || new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return "—";
  const safeEndDate = endDate || startDate;
  return `${formatDate(startDate)} – ${formatDate(safeEndDate)}`;
}

export default function MyLeave() {
  const { user } = useAuth();
  const [participants, setParticipants] = useState([]);
  const [records, setRecords] = useState([]);
  const [balanceSummary, setBalanceSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [validationErrors, setValidationErrors] = useState({});
  const [cancelTarget, setCancelTarget] = useState(null);
  const [form, setForm] = useState({
    leaveType: "sick_leave",
    days: "",
    startDate: getTodayLocalISO(),
    reason: "",
  });

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await authFetch("/participants");
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Failed to load your participant records");

      const nextParticipants = Array.isArray(data?.participants) ? data.participants : [];
      const nextRecords = await fetchLeaveRequests();
      const balanceData = await fetchLeaveBalances();
      const currentParticipant = getCurrentParticipantForUser(user, nextParticipants);
      const participantBalance = currentParticipant
        ? (balanceData.balances || []).find((item) => String(item.participantId) === String(currentParticipant.id))
        : null;

      setParticipants(nextParticipants);
      setRecords(nextRecords);
      setBalanceSummary(participantBalance || null);
    } catch (err) {
      setError(err?.message || "Unable to load your leave information.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => loadData(), 0);
    return () => clearTimeout(timer);
  }, []);

  const currentParticipant = useMemo(
    () => getCurrentParticipantForUser(user, participants),
    [user, participants]
  );

  const summary = useMemo(() => {
    if (currentParticipant && balanceSummary) {
      return {
        ...balanceSummary,
        participantId: currentParticipant.id,
        participantName: currentParticipant.firstName || currentParticipant.lastName ? `${currentParticipant.firstName || ""} ${currentParticipant.lastName || ""}`.trim() : currentParticipant.participantIdentifier || currentParticipant.studentNumber || currentParticipant.full_name || "Participant",
      };
    }

    return getLeaveSummaryForCurrentUser(user, participants, records);
  }, [balanceSummary, currentParticipant, user, participants, records]);

  const history = useMemo(
    () => records.filter((record) => {
      if (!currentParticipant) return false;
      return String(record.participantId ?? "") === String(currentParticipant.id) || String(record.userId ?? "") === String(user?.id ?? "");
    }).sort((a, b) => new Date(b.submittedAt || b.startDate || 0) - new Date(a.submittedAt || a.startDate || 0)),
    [records, currentParticipant, user]
  );

  const normalizeStatusLabel = (value) => String(value || "pending").trim().toLowerCase();

  const selectedBalance = summary.typeSummaries.find((item) => item.typeKey === form.leaveType) || summary.typeSummaries[0];
  const computedEndDate = useMemo(() => getEndDateFromDays(form.startDate, form.days), [form.startDate, form.days]);

  const leaveTypeLabel = LEAVE_TYPES.find((type) => type.key === form.leaveType)?.label || "Leave";
  const requestedDays = Number(form.days) || 0;
  const availableDays = Number(selectedBalance?.remaining || 0);
  const daysRemainingAfterApproval = Math.max(availableDays - requestedDays, 0);
  const previewSummary = {
    label: leaveTypeLabel,
    range: form.startDate && requestedDays > 0 ? formatDateRange(form.startDate, computedEndDate) : "Choose a date range",
    requestText: `${requestedDays || 0} day${requestedDays === 1 ? "" : "s"} requested`,
    balanceText: `${availableDays} day${availableDays === 1 ? "" : "s"} available → ${daysRemainingAfterApproval} day${daysRemainingAfterApproval === 1 ? "" : "s"} remaining after approval`,
  };

  const closeModal = () => {
    if (!isSubmitting) {
      setValidationErrors({});
      setIsModalOpen(false);
    }
  };

  const validateLeaveForm = () => {
    const nextErrors = {};
    const days = Number(form.days);

    if (!form.leaveType) {
      nextErrors.leaveType = "Leave type is required.";
    }

    if (form.days === "" || !Number.isFinite(days) || days < 1) {
      nextErrors.days = "Number of days is required and must be at least 1.";
    }

    if (Number.isFinite(days) && days > Number(selectedBalance?.remaining || 0)) {
      nextErrors.days = `Requested days exceed your available balance of ${selectedBalance?.remaining ?? 0}.`;
    }

    if (!form.startDate) {
      nextErrors.startDate = "Start date is required.";
    }

    if (form.startDate && computedEndDate && new Date(computedEndDate) < new Date(form.startDate)) {
      nextErrors.startDate = "End date cannot be before the start date.";
    }

    if (!form.reason.trim()) {
      nextErrors.reason = "Please provide a reason for your request.";
    }

    return nextErrors;
  };

  const handleRequestSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateLeaveForm();
    setValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const firstError = Object.values(nextErrors)[0];
      setNotice({ type: "error", message: firstError });
      return;
    }

    const days = Number(form.days);
    const finalEndDate = getEndDateFromDays(form.startDate, days);

    setIsSubmitting(true);
    setNotice({ type: "", message: "" });
    try {
      await createLeaveRequest({
        participantId: currentParticipant.id,
        userId: currentParticipant.userId ?? currentParticipant.user_id ?? user?.id,
        organizationId: currentParticipant.organizationId ?? currentParticipant.organization_id ?? null,
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: finalEndDate,
        days,
        reason: form.reason.trim(),
      });
      setRecords(await fetchLeaveRequests());
      setForm({ leaveType: "sick_leave", days: "", startDate: getTodayLocalISO(), reason: "" });
      setValidationErrors({});
      setIsModalOpen(false);
      setNotice({ type: "success", message: "Leave request submitted successfully." });
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Unable to submit leave request." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!cancelTarget?.id) return;
    setIsSubmitting(true);
    setNotice({ type: "", message: "" });

    try {
      await cancelLeaveRequest(cancelTarget.id);
      setRecords(await fetchLeaveRequests());
      setCancelTarget(null);
      setNotice({ type: "success", message: "Leave request cancelled successfully." });
    } catch (err) {
      setNotice({ type: "error", message: err?.message || "Unable to cancel leave request." });
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
        <button type="button" className="leave-primary-btn" onClick={() => { setNotice({ type: "", message: "" }); setValidationErrors({}); setIsModalOpen(true); }}><FiPlus /> Request Leave</button>
      </header>

      {notice.message && <div className={`leave-alert leave-alert--${notice.type}`}>{notice.message}</div>}

      <section className="leave-summary-grid">
        <div className="leave-stat-card"><span className="leave-stat-icon leave-stat-icon--blue"><FiCalendar /></span><div><span>Total Remaining</span><strong>{summary.totalRemaining}</strong><small>days remaining</small></div></div>
        <div className="leave-stat-card"><span className="leave-stat-icon leave-stat-icon--green"><FiCheck /></span><div><span>Total Used</span><strong>{summary.totalUsed}</strong><small>approved days</small></div></div>
        <div className="leave-stat-card"><span className="leave-stat-icon leave-stat-icon--amber"><FiClock /></span><div><span>Pending Requests</span><strong>{history.filter((record) => String(record.status || "").trim().toLowerCase() === "pending").length}</strong><small>awaiting review</small></div></div>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="7" className="leave-empty">No leave requests yet.<small>Request your first leave using the button above.</small></td>
                </tr>
              ) : (
                history.map((record) => {
                  const statusLabel = normalizeStatusLabel(record.status);
                  const canCancel = statusLabel === "pending";
                  return (
                    <tr key={record.id}>
                      <td>{LEAVE_TYPES.find((type) => type.key === record.leaveType)?.label || record.leaveType}</td>
                      <td>{formatDate(record.startDate)}{record.endDate && record.endDate !== record.startDate ? ` - ${formatDate(record.endDate)}` : ""}</td>
                      <td>{record.days}</td>
                      <td>{record.reason || "—"}</td>
                      <td><span className={`leave-status leave-status--${getStatusTone(record.status)}`}>{String(record.status || "pending").toUpperCase()}</span><small className="leave-status-note">{statusLabel === "pending" ? "Waiting for Admin approval" : statusLabel === "approved" ? "Approved" : statusLabel === "cancelled" ? "Cancelled" : "Rejected"}{record.rejectionReason ? `: ${record.rejectionReason}` : ""}</small></td>
                      <td>{formatDate(record.submittedAt)}</td>
                      <td>
                        {canCancel ? (
                          <button type="button" className="leave-secondary-btn leave-secondary-btn--danger" onClick={() => setCancelTarget(record)} disabled={isSubmitting}>Cancel Request</button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {cancelTarget && (
        <div className="leave-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCancelTarget(null); }}>
          <div className="leave-modal leave-modal--compact" role="dialog" aria-modal="true" aria-labelledby="cancel-leave-title">
            <div className="leave-modal-header">
              <div>
                <p className="leave-kicker">Leave request</p>
                <h2 id="cancel-leave-title">Cancel Leave Request?</h2>
              </div>
              <button type="button" className="leave-close-btn" onClick={() => setCancelTarget(null)} aria-label="Close cancel dialog">x</button>
            </div>

            <div className="leave-cancel-body">
              <p>Are you sure you want to cancel this leave request? This action will remove it from the approval queue.</p>
              <div className="leave-cancel-details">
                <div><span>Leave Type</span><strong>{LEAVE_TYPES.find((type) => type.key === cancelTarget.leaveType)?.label || cancelTarget.leaveType}</strong></div>
                <div><span>Date range</span><strong>{formatDateRange(cancelTarget.startDate, cancelTarget.endDate)}</strong></div>
                <div><span>Number of Days</span><strong>{cancelTarget.days}</strong></div>
              </div>
            </div>

            <div className="leave-form-actions">
              <button type="button" className="leave-secondary-btn" onClick={() => setCancelTarget(null)} disabled={isSubmitting}>Keep Request</button>
              <button type="button" className="leave-primary-btn leave-primary-btn--danger" onClick={handleCancelRequest} disabled={isSubmitting}>{isSubmitting ? "Cancelling..." : "Yes, Cancel Request"}</button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="leave-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          <div className="leave-modal" role="dialog" aria-modal="true" aria-labelledby="viewer-leave-modal-title">
            <div className="leave-modal-header">
              <div>
                <p className="leave-kicker">New request</p>
                <h2 id="viewer-leave-modal-title">Request Leave</h2>
              </div>
              <button type="button" className="leave-close-btn" onClick={closeModal} aria-label="Close request form">x</button>
            </div>

            <form className="leave-form" onSubmit={handleRequestSubmit}>
              <div className="leave-form-row">
                <div className="leave-form-field leave-form-field--full">
                  <label>Leave Type</label>
                  <select value={form.leaveType} onChange={(event) => setForm((prev) => ({ ...prev, leaveType: event.target.value }))}>
                    {LEAVE_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
                  </select>
                  {validationErrors.leaveType && <div className="leave-field-error">{validationErrors.leaveType}</div>}
                </div>
              </div>

              <div className="leave-form-row">
                <div className="leave-form-field">
                  <label>Available Balance</label>
                  <div className="leave-readonly-box">{selectedBalance?.remaining ?? 0} days</div>
                </div>
                <div className="leave-form-field">
                  <label>Start Date</label>
                  <input type="date" value={form.startDate} onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))} />
                  {validationErrors.startDate && <div className="leave-field-error">{validationErrors.startDate}</div>}
                </div>
              </div>

              <div className="leave-form-row">
                <div className="leave-form-field">
                  <label>Number of Days</label>
                  <input type="number" min="1" max={selectedBalance?.remaining || 0} value={form.days} onChange={(event) => setForm((prev) => ({ ...prev, days: event.target.value }))} />
                  {validationErrors.days && <div className="leave-field-error">{validationErrors.days}</div>}
                </div>
                <div className="leave-form-field">
                  <label>End Date / Valid Until</label>
                  <input type="text" className="leave-input-readonly" readOnly value={computedEndDate ? formatDate(computedEndDate) : ""} placeholder="Select a start date" />
                </div>
              </div>

              <div className="leave-form-field leave-form-field--full">
                <label>Reason</label>
                <textarea rows="3" value={form.reason} onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))} />
                {validationErrors.reason && <div className="leave-field-error">{validationErrors.reason}</div>}
              </div>

              <div className="leave-summary-card">
                <div className="leave-summary-card__title">Leave Summary</div>
                <div className="leave-summary-card__type">{previewSummary.label}</div>
                <div className="leave-summary-card__range">{previewSummary.range}</div>
                <div className="leave-summary-card__meta">{previewSummary.requestText}</div>
                <div className="leave-summary-card__meta leave-summary-card__meta--muted">{previewSummary.balanceText}</div>
              </div>

              <div className="leave-form-actions">
                <button type="button" className="leave-secondary-btn" onClick={closeModal} disabled={isSubmitting}>Cancel</button>
                <button type="submit" className="leave-primary-btn" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : <><FiSend /> Submit Request</>}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
