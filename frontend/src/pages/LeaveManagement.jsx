import { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiCheck, FiClock, FiEdit3, FiFileText, FiPlus, FiUsers, FiX, FiXCircle } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import { hasPermission } from "../context/AuthContext";
import { authFetch } from "../services/apiClient";
import {
  LEAVE_TYPES,
  addManualAdjustment,
  createLeaveRequest,
  fetchLeaveRequests,
  getAllParticipantLeaveSummaries,
  getLeaveMonthKey,
  getLeaveRequests,
  reviewLeaveRequest,
} from "../services/leaveService";
import "../styles/LeaveManagement.css";

function parseLocalDate(value) {
  if (!value || typeof value !== "string") return null;
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value.trim());
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatLocalISO(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addLocalDays(dateString, daysToAdd) {
  const baseDate = parseLocalDate(dateString);
  if (!baseDate) return "";
  const numericDays = Number(daysToAdd) || 0;
  const nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + numericDays);
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
  return `${formatDate(startDate)} – ${formatDate(endDate || startDate)}`;
}

function formatDays(value) {
  const numeric = Number(value) || 0;
  return `${numeric} day${numeric === 1 ? "" : "s"}`;
}

function getLowBalanceTone(remaining, allocation) {
  const alloc = Number(allocation) || 0;
  const rem = Number(remaining) || 0;
  if (alloc > 0 && rem <= 0) return "danger";
  if (alloc > 0 && rem / alloc <= 0.25) return "warning";
  return "good";
}

function getStatusTone(status) {
  switch (String(status || "").toLowerCase()) {
    case "approved": return "green";
    case "rejected": return "red";
    case "pending": return "amber";
    default: return "gray";
  }
}

function getTodayLocalISO() {
  const today = new Date();
  return formatLocalISO(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
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
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    participantId: "",
    leaveType: "sick_leave",
    days: "",
    date: getTodayLocalISO(),
    startDate: getTodayLocalISO(),
    reason: "",
    adjustmentType: "ADD",
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await authFetch("/participants");
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Failed to load participants");

      const allParticipants = Array.isArray(data?.participants) ? data.participants : [];
      const stored = await fetchLeaveRequests();

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
  const departments = useMemo(() => [...new Set(allSummaries.map((item) => item.department).filter((item) => item && item !== "—"))].sort(), [allSummaries]);
  const filteredSummaries = useMemo(() => allSummaries.filter((item) => `${item.participantName} ${item.participantId}`.toLowerCase().includes(search.toLowerCase()) && (!departmentFilter || item.department === departmentFilter)), [allSummaries, search, departmentFilter]);
  const visibleSummaries = filteredSummaries.slice((page - 1) * 10, page * 10);

  const selectedParticipant = participants.find((item) => String(item.id) === String(form.participantId));
  const selectedSummary = selectedParticipant ? allSummaries.find((item) => String(item.participantId) === String(selectedParticipant.id)) : null;
  const selectedBalance = selectedSummary ? selectedSummary.typeSummaries.find((item) => item.typeKey === form.leaveType) : null;
  const requestEndDate = useMemo(() => getEndDateFromDays(form.startDate, form.days), [form.startDate, form.days]);
  const requestedDays = Number(form.days) || 0;
  const availableDays = Number(selectedBalance?.remaining || 0);
  const remainingAfterApproval = Math.max(availableDays - requestedDays, 0);

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

  const clearModalState = () => {
    setActiveModal("");
    setFormErrors({});
    setIsSubmitting(false);
  };

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
        date: getTodayLocalISO(),
        startDate: getTodayLocalISO(),
        reason: "",
        adjustmentType: "ADD",
      });
      loadData();
      clearModalState();
    } catch (err) {
      setToast(err?.message || "Unable to save adjustment.");
    }
  };

  const handleApprove = async (recordId) => {
    if (!canManageLeave) return;
    const record = records.find((item) => String(item.id) === String(recordId));
    if (!record) return;

    try {
      await reviewLeaveRequest(recordId, "approved");
      setToast("Leave request approved.");
      loadData();
    } catch (err) {
      setToast(err?.message || "Unable to approve leave request.");
    }
  };

  const handleReject = async (recordId) => {
    if (!canManageLeave) return;
    try {
      await reviewLeaveRequest(recordId, "rejected");
      setToast("Leave request rejected.");
      loadData();
    } catch (err) {
      setToast(err?.message || "Unable to reject leave request.");
    }
  };

  const validateRequestForm = () => {
    const nextErrors = {};
    const days = Number(form.days);

    if (!form.participantId) {
      nextErrors.participantId = "Participant is required.";
    }

    if (!form.leaveType) {
      nextErrors.leaveType = "Leave type is required.";
    }

    if (form.days === "" || !Number.isFinite(days) || days < 1) {
      nextErrors.days = "Number of days is required and must be at least 1.";
    }

    if (Number.isFinite(days) && selectedBalance && days > Number(selectedBalance.remaining || 0)) {
      nextErrors.days = `Requested days exceed the available balance of ${selectedBalance.remaining}.`;
    }

    if (!form.startDate) {
      nextErrors.startDate = "Start date is required.";
    }

    if (form.startDate && requestEndDate && new Date(requestEndDate) < new Date(form.startDate)) {
      nextErrors.startDate = "End date cannot be before the start date.";
    }

    if (!form.reason.trim()) {
      nextErrors.reason = "Please provide a reason for your request.";
    }

    return nextErrors;
  };

  const handleRequestSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateRequestForm();
    setFormErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      const firstError = Object.values(nextErrors)[0];
      setToast(firstError);
      return;
    }

    const selectedParticipant = participants.find((item) => String(item.id) === String(form.participantId));
    if (!selectedParticipant) {
      setToast("Select a valid participant.");
      return;
    }

    const finalDays = Number(form.days);
    const finalEndDate = getEndDateFromDays(form.startDate, finalDays);

    setIsSubmitting(true);
    try {
      await createLeaveRequest({
        participantId: selectedParticipant.id,
        userId: selectedParticipant.userId ?? selectedParticipant.user_id ?? user?.id,
        organizationId: selectedParticipant.organizationId ?? selectedParticipant.organization_id ?? null,
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: finalEndDate,
        days: finalDays,
        reason: form.reason.trim(),
        status: "pending",
      });
      setToast("Leave request submitted for review.");
      setForm({
        participantId: "",
        leaveType: "sick_leave",
        days: "",
        date: getTodayLocalISO(),
        startDate: getTodayLocalISO(),
        reason: "",
        adjustmentType: "ADD",
      });
      setFormErrors({});
      loadData();
      clearModalState();
    } catch (err) {
      setToast(err?.message || "Unable to submit leave request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const participantName = (participant) => participant
    ? `${participant.firstName || ""} ${participant.lastName || ""}`.trim() || participant.participantIdentifier || participant.studentNumber || `Participant ${participant.id}`
    : "Unknown";

  const renderRequestForm = () => (
    <form className="leave-form" onSubmit={handleRequestSubmit}>
      <div className="leave-form-row">
        <div className="leave-form-field leave-form-field--full">
          <label>Participant</label>
          <select value={form.participantId} onChange={(event) => setForm((prev) => ({ ...prev, participantId: event.target.value }))}>
            <option value="">Select participant</option>
            {participants.map((participant) => <option key={participant.id} value={participant.id}>{participantName(participant)}</option>)}
          </select>
          {formErrors.participantId && <div className="leave-field-error">{formErrors.participantId}</div>}
        </div>
      </div>

      <div className="leave-form-row">
        <div className="leave-form-field">
          <label>Leave Type</label>
          <select value={form.leaveType} onChange={(event) => setForm((prev) => ({ ...prev, leaveType: event.target.value }))}>
            {LEAVE_TYPES.map((leaveType) => <option key={leaveType.key} value={leaveType.key}>{leaveType.label}</option>)}
          </select>
          {formErrors.leaveType && <div className="leave-field-error">{formErrors.leaveType}</div>}
        </div>
        <div className="leave-form-field">
          <label>Available Balance</label>
          <div className="leave-readonly-box">{selectedBalance?.remaining ?? 0} days</div>
        </div>
      </div>

      <div className="leave-form-row">
        <div className="leave-form-field">
          <label>Start Date</label>
          <input type="date" value={form.startDate} onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))} />
          {formErrors.startDate && <div className="leave-field-error">{formErrors.startDate}</div>}
        </div>
        <div className="leave-form-field">
          <label>Number of Days</label>
          <input type="number" min="1" value={form.days} onChange={(event) => setForm((prev) => ({ ...prev, days: event.target.value }))} />
          {formErrors.days && <div className="leave-field-error">{formErrors.days}</div>}
        </div>
      </div>

      <div className="leave-form-field leave-form-field--full">
        <label>End Date / Valid Until</label>
        <input type="text" className="leave-input-readonly" readOnly value={requestEndDate ? formatDate(requestEndDate) : ""} placeholder="Select a start date and number of days" />
      </div>

      <div className="leave-form-field leave-form-field--full">
        <label>Reason</label>
        <textarea rows="3" value={form.reason} onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))} />
        {formErrors.reason && <div className="leave-field-error">{formErrors.reason}</div>}
      </div>

      <div className="leave-summary-card">
        <div className="leave-summary-card__title">Leave Summary</div>
        <div className="leave-summary-card__type">{LEAVE_TYPES.find((type) => type.key === form.leaveType)?.label || "Leave"}</div>
        <div className="leave-summary-card__range">{form.startDate && requestedDays > 0 ? formatDateRange(form.startDate, requestEndDate) : "Select a date range"}</div>
        <div className="leave-summary-card__meta">{requestedDays || 0} day{requestedDays === 1 ? "" : "s"} requested</div>
        <div className="leave-summary-card__meta leave-summary-card__meta--muted">{availableDays} day{availableDays === 1 ? "" : "s"} available → {remainingAfterApproval} day{remainingAfterApproval === 1 ? "" : "s"} remaining after approval</div>
      </div>

      <div className="leave-form-actions">
        <button type="button" className="leave-secondary-btn" onClick={clearModalState} disabled={isSubmitting}>Cancel</button>
        <button type="submit" className="leave-primary-btn" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : <><FiCheck /> Submit Request</>}</button>
      </div>
    </form>
  );

  const renderAdjustmentForm = () => (
    <form className="leave-form" onSubmit={handleAdjustmentSubmit}>
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
      <label>
        Adjustment Type
        <select value={form.adjustmentType} onChange={(event) => setForm((prev) => ({ ...prev, adjustmentType: event.target.value }))}>
          <option value="ADD">ADD</option><option value="DEDUCT">DEDUCT</option>
        </select>
      </label>
      <label>
        Reason / Adjustment Note
        <textarea rows="3" value={form.reason} onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))} />
      </label>
      <button type="submit" className="leave-primary-btn" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : <><FiCheck /> Save Adjustment</>}</button>
    </form>
  );

  return (
    <div className="leave-page">
      <header className="leave-header">
          <div><p className="leave-eyebrow">Leave Management</p><h1>Leave Management</h1><p className="leave-subtitle">Manage participant leave balances and review leave requests.</p><span className="leave-period-indicator">{currentPeriodLabel}</span></div>
      </header>
      {toast && <div className="leave-toast">{toast}</div>}
      {error && <div className="leave-alert leave-alert--error">{error}</div>}

      {!loading && <>
        <section className="leave-summary-grid">
          {[
            { label: "Total Participants", value: stats.totalParticipants, icon: FiUsers, tone: "blue" },
            { label: "Pending Requests", value: stats.pendingRequests, icon: FiClock, tone: "amber" },
            { label: "Approved Leave Days", value: stats.approvedLeaveDays, icon: FiCheck, tone: "green" },
            { label: "Remaining Leave Days", value: stats.remainingLeaveDays, icon: FiCalendar, tone: "purple" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div className="leave-stat-card" key={label}><span className={`leave-stat-icon leave-stat-icon--${tone}`}><Icon /></span><div><span>{label}</span><strong>{value}</strong></div></div>
          ))}
        </section>

        <section className="leave-panel">
          <div className="leave-section-heading"><div><p className="leave-kicker">Needs attention</p><h2>Pending Leave Requests</h2></div><span className="leave-count leave-count--amber">{pendingRequests.length} pending</span></div>
          <div className="leave-request-list">{pendingRequests.length === 0 ? <div className="leave-empty leave-empty--block"><FiCheck /><span>No pending requests right now</span></div> : pendingRequests.map((record) => { const participant = participants.find((item) => String(item.id) === String(record.participantId)); const leaveType = LEAVE_TYPES.find((type) => type.key === record.leaveType); return <article className="leave-request-row" key={record.id}><div className="leave-request-person"><span className="leave-avatar">{participantName(participant).charAt(0)}</span><div><strong>{record.requesterName || participantName(participant)}</strong><small>{record.requesterRole || "Viewer"} · ID: {record.participantId}</small></div></div><div><span className={`leave-type-badge leave-type-badge--${record.leaveType}`}>{leaveType?.label || record.leaveType}</span></div><div className="leave-request-meta"><span><FiFileText /> {formatDays(record.days)}</span><span><FiCalendar /> {formatDate(record.startDate)} - {formatDate(record.endDate)}</span></div><span className={`leave-status leave-status--${getStatusTone(record.status)}`}>PENDING</span><div className="leave-actions">{canManageLeave && <><button type="button" className="leave-action-btn leave-action-btn--approve" onClick={() => handleApprove(record.id)}><FiCheck /> Approve</button><button type="button" className="leave-action-btn leave-action-btn--reject" onClick={() => handleReject(record.id)}><FiXCircle /> Reject</button></>}<button type="button" className="leave-action-btn leave-action-btn--details" onClick={() => setSelectedRequestId(selectedRequestId === record.id ? "" : record.id)}>Details</button></div>{selectedRequestId === record.id && <div className="leave-request-detail"><strong>Reason</strong><p>{record.reason || "No reason provided"}</p><p>Submitted {formatDate(record.submittedAt)}</p></div>}</article>; })}</div>
        </section>

        <section className="leave-panel leave-balances-panel">
          <div className="leave-section-heading"><div><p className="leave-kicker">Overview</p><h2>Participant Leave Balances</h2></div><span className="leave-count">{filteredSummaries.length} participants</span></div>
          <div className="leave-filters"><input aria-label="Search participant" placeholder="Search participant" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><select aria-label="Filter department or group" value={departmentFilter} onChange={(event) => { setDepartmentFilter(event.target.value); setPage(1); }}><option value="">All departments / groups</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></div>
          <div className="leave-table-wrap"><table className="leave-table"><thead><tr><th>Participant</th><th>Organization</th><th>Department / Group</th>{LEAVE_TYPES.map((type) => <th key={type.key}>{type.label}</th>)}<th>Total Remaining</th></tr></thead><tbody>
            {visibleSummaries.length === 0 ? <tr><td colSpan="9" className="leave-empty">No participants found</td></tr> : visibleSummaries.map((summary) => <tr key={summary.participantId ?? summary.participantName}><td><strong>{summary.participantName}</strong><small className="leave-muted">ID: {summary.participantId ?? "—"}</small></td><td>{summary.organization}</td><td>{summary.department}</td>{summary.typeSummaries.map((item) => <td key={`${summary.participantId}-${item.typeKey}`}><span className={`leave-balance-pill leave-balance-pill--${getLowBalanceTone(item.remaining, item.allocation)} leave-type--${item.typeKey}`}>{item.remaining} / {item.allocation}</span><small className="leave-balance-used">{item.used} used · {item.pending} pending</small></td>)}<td><strong className="leave-total-days">{summary.totalRemaining} days</strong></td></tr>)}
          </tbody></table></div>
          {filteredSummaries.length > 10 && <div className="leave-pagination"><button type="button" className="leave-secondary-btn" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {Math.ceil(filteredSummaries.length / 10)}</span><button type="button" className="leave-secondary-btn" disabled={page >= Math.ceil(filteredSummaries.length / 10)} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
        </section>

        <section className="leave-quick-actions"><div><p className="leave-kicker">Shortcuts</p><h2>Quick Actions</h2><p>Update balances or send a request without leaving this overview.</p></div><div className="leave-quick-action-buttons"><button type="button" className="leave-primary-btn" onClick={() => setActiveModal("request")}><FiPlus /> New Leave Request</button>{canManageLeave && <button type="button" className="leave-secondary-btn" onClick={() => setActiveModal("adjustment")}><FiEdit3 /> Adjust Leave Balance</button>}</div></section>
      </>}
      {loading && <div className="leave-loader">Loading leave data…</div>}

      {activeModal && <div className="leave-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) clearModalState(); }}><div className="leave-modal" role="dialog" aria-modal="true" aria-labelledby="leave-modal-title"><div className="leave-modal-header"><div><p className="leave-kicker">Leave Management</p><h2 id="leave-modal-title">{activeModal === "adjustment" ? "Adjust Leave Balance" : "New Leave Request"}</h2></div><button type="button" className="leave-close-btn" onClick={clearModalState} aria-label="Close modal"><FiX /></button></div>{activeModal === "adjustment" ? renderAdjustmentForm() : renderRequestForm()}</div></div>}
    </div>
  );
}

