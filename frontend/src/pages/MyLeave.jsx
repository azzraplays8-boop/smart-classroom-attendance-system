import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { authFetch } from "../services/apiClient";
import {
  LEAVE_TYPES,
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
          <h1>{currentParticipant.firstName || currentParticipant.lastName ? `${currentParticipant.firstName || ""} ${currentParticipant.lastName || ""}`.trim() : user?.full_name || "Viewer"}</h1>
        </div>
      </header>

      <section className="leave-summary-grid">
        {summary.typeSummaries.map((item) => (
          <div key={item.typeKey} className="leave-stat-card leave-stat-card--compact">
            <span>{item.label}</span>
            <strong>{item.allocation} Total</strong>
            <small>{item.approved} Used</small>
            <small>{item.pending} Pending</small>
            <small className={`leave-balance-pill leave-balance-pill--${getLowBalanceTone(item.remaining, item.allocation)}`}>{item.remaining} Remaining</small>
          </div>
        ))}
      </section>

      <section className="leave-overview-grid">
        <div className="leave-stat-card">
          <span>Total Leave Allocation</span>
          <strong>{summary.totalAllocation}</strong>
        </div>
        <div className="leave-stat-card">
          <span>Total Used</span>
          <strong>{summary.totalUsed}</strong>
        </div>
        <div className="leave-stat-card">
          <span>Total Pending</span>
          <strong>{summary.totalPending}</strong>
        </div>
        <div className="leave-stat-card">
          <span>Total Remaining</span>
          <strong>{summary.totalRemaining}</strong>
        </div>
      </section>

      <section className="leave-panel">
        <h2>My Leave History</h2>
        <div className="leave-table-wrap">
          <table className="leave-table">
            <thead>
              <tr>
                <th>Leave Type</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Number of Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Date Submitted</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="7" className="leave-empty">No leave history yet.</td>
                </tr>
              ) : (
                history.map((record) => (
                  <tr key={record.id}>
                    <td>{LEAVE_TYPES.find((type) => type.key === record.leaveType)?.label || record.leaveType}</td>
                    <td>{formatDate(record.startDate)}</td>
                    <td>{formatDate(record.endDate)}</td>
                    <td>{record.days}</td>
                    <td>{record.reason || "—"}</td>
                    <td><span className={`leave-status leave-status--${getStatusTone(record.status)}`}>{record.status}</span></td>
                    <td>{formatDate(record.submittedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
