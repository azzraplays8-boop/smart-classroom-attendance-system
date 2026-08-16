import { useEffect, useMemo, useState } from "react";
import {
  FiActivity, FiCheckCircle, FiClock, FiDatabase, FiFileText, FiCalendar,
  FiLogIn, FiLogOut, FiMessageCircle, FiPercent, FiRefreshCw, FiTag,
  FiUserCheck, FiXCircle,
} from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import { authFetch } from "../services/apiClient";
import "../styles/MyAttendance.css";

function formatDate(dateValue) {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "present") return "ma-status ma-status--present";
  if (normalized === "late") return "ma-status ma-status--late";
  if (normalized === "absent") return "ma-status ma-status--absent";
  return "ma-status ma-status--muted";
}

function statusIcon(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "present") return <FiCheckCircle />;
  if (normalized === "late") return <FiClock />;
  if (normalized === "absent") return <FiXCircle />;
  return <FiTag />;
}

function rateFromSummary(summary) {
  const raw = Number(summary?.attendanceRate);
  if (Number.isNaN(raw)) return 0;
  return Math.min(100, Math.max(0, raw));
}

function rateInterpretation(rate) {
  if (rate >= 90) return { text: "Excellent attendance", tone: "excellent" };
  if (rate >= 75) return { text: "Good attendance", tone: "good" };
  return { text: "Needs improvement", tone: "low" };
}

const SKELETON_ROWS = 5;

export default function MyAttendance() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState(null);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ totalRecords: 0, present: 0, late: 0, absent: 0, attendanceRate: 0 });
  const [error, setError] = useState("");

  // Preserved API logic: fetches the authenticated viewer's OWN attendance.
  const loadAttendance = async (opts = {}) => {
    const aborted = opts?.aborted;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/attendance/me");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load your attendance");
      if (aborted) return;
      setMember(data?.member || null);
      setRecords(Array.isArray(data?.records) ? data.records : []);
      setSummary(data?.summary || { totalRecords: 0, present: 0, late: 0, absent: 0, attendanceRate: 0 });
    } catch (err) {
      if (!aborted) setError(err?.message || "Unable to load your attendance.");
    } finally {
      if (!aborted) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadAttendance({ aborted: cancelled });
    return () => { cancelled = true; };
  }, []);

  const memberName = useMemo(() => {
    if (!member) return user?.full_name || "Viewer";
    return [member.firstName, member.lastName].filter(Boolean).join(" ") || user?.full_name || "Viewer";
  }, [member, user]);

  const rate = useMemo(() => rateFromSummary(summary), [summary]);
  const rateInfo = useMemo(() => rateInterpretation(rate), [rate]);
  const hasRemarks = useMemo(() => records.some((r) => Boolean(r?.remarks)), [records]);

  const stats = useMemo(
    () => [
      { key: "total", label: "Total Attendance", value: summary.totalRecords, icon: <FiDatabase />, tone: "indigo" },
      { key: "present", label: "Present", value: summary.present, icon: <FiCheckCircle />, tone: "green" },
      { key: "late", label: "Late", value: summary.late, icon: <FiClock />, tone: "amber" },
      { key: "absent", label: "Absent", value: summary.absent, icon: <FiXCircle />, tone: "red" },
      { key: "rate", label: "Attendance Rate", value: `${rate}%`, icon: <FiPercent />, tone: "violet" },
    ],
    [summary, rate]
  );

    return (
    <div className="ma-page">
      <main className="ma-main">
        <header className="ma-top">
          <h1 className="ma-title">My Attendance</h1>
          <p className="ma-subtitle">Your personal KATAGA attendance portal</p>
        </header>

        {loading ? (
          <SkeletonView />
        ) : error ? (
          <ErrorView message="Unable to load your attendance" sub="Please try again." onRetry={() => loadAttendance()} />
        ) : !member ? (
          <Card className="ma-notlinked">
            <div className="ma-notlinked-icon" aria-hidden><FiUserCheck /></div>
            <h3 className="ma-notlinked-title">Account not linked</h3>
            <p className="ma-notlinked-body">
              Your account is not yet linked to a participant record. Please contact an administrator.
            </p>
          </Card>
        ) : (
          <>
            <section className="ma-hero ma-card">
              <div className="ma-hero-glow" aria-hidden />
              <div className="ma-hero-inner">
                <div className="ma-avatar" aria-hidden><FiUserCheck /></div>
                <div className="ma-hero-text">
                  <h2 className="ma-hero-name">{memberName}</h2>
                  <p className="ma-hero-role">Viewer · {user?.full_name || "Member"}</p>
                  <div className="ma-hero-meta">
                    <span className="ma-hero-meta-item"><FiUserCheck /> Participant {member.participantIdentifier || "—"}</span>
                    <span className="ma-hero-meta-item"><FiActivity /> {member.department || "—"}</span>
                    <span className="ma-hero-meta-item"><FiCalendar /> Year {member.year || "—"}</span>
                    <span className="ma-hero-meta-item"><FiTag /> Section {member.section || "—"}</span>
                  </div>
                </div>
              </div>
            </section>
                        <section className="ma-section">
              <h3 className="ma-section-title">Attendance Summary</h3>
              <div className="ma-stats ma-stats-grid">
                {stats.map((s) => (
                  <div key={s.key} className={`ma-stat ma-stat--${s.tone} ma-card`}>
                    <div className={`ma-stat-icon ma-stat-icon--${s.tone}`} aria-hidden>{s.icon}</div>
                    <div className="ma-stat-body">
                      <span className="ma-stat-label">{s.label}</span>
                      <span className="ma-stat-value">{s.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="ma-section">
              <div className="ma-rate ma-card">
                <div className="ma-rate-head">
                  <div className="ma-rate-icon" aria-hidden><FiPercent /></div>
                  <h3 className="ma-rate-title">Attendance Rate</h3>
                </div>
                <div className="ma-rate-main">
                  <div className="ma-rate-value">{rate}%</div>
                  <div className="ma-rate-bar">
                    <div className={`ma-rate-fill ma-rate-fill--${rateInfo.tone}`} style={{ width: `${rate}%` }} />
                  </div>
                  <div className={`ma-rate-interp ma-rate-interp--${rateInfo.tone}`}>{rateInfo.text}</div>
                </div>
              </div>
            </section>

            <section className="ma-section">
              <h3 className="ma-section-title">My Attendance History</h3>
              {records.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="ma-history ma-card">
                  <div className="ma-table-wrap">
                    <table className="ma-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Activity / Event</th>
                          <th>Time In</th>
                          <th>Time Out</th>
                          <th>Status</th>
                          {hasRemarks && <th>Remarks</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record) => (
                          <tr key={record.id}>
                            <td data-label="Date">{formatDate(record.attendanceDate)}</td>
                            <td data-label="Activity">{record.activity || "Attendance"}</td>
                            <td data-label="Time In">{formatTime(record.timeIn)}</td>
                            <td data-label="Time Out">{formatTime(record.timeOut)}</td>
                            <td data-label="Status">
                              <span className={statusClass(record.status)}>
                                <span className="ma-status-ink" aria-hidden>{statusIcon(record.status)}</span>
                                {record.status || "—"}
                              </span>
                            </td>
                            {hasRemarks && <td data-label="Remarks">{record.remarks || "—"}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="ma-cards" role="list">
                    {records.map((record) => (
                      <div key={record.id} className="ma-record-card" role="listitem">
                        <div className="ma-record-card-head">
                          <span className="ma-record-date">{formatDate(record.attendanceDate)}</span>
                          <span className={statusClass(record.status)}>
                            <span className="ma-status-ink" aria-hidden>{statusIcon(record.status)}</span>
                            {record.status || "—"}
                          </span>
                        </div>
                        <div className="ma-record-row"><span className="ma-record-label"><FiActivity /> Activity</span><span className="ma-record-value">{record.activity || "Attendance"}</span></div>
                        <div className="ma-record-row"><span className="ma-record-label"><FiLogIn /> Time In</span><span className="ma-record-value">{formatTime(record.timeIn)}</span></div>
                        <div className="ma-record-row"><span className="ma-record-label"><FiLogOut /> Time Out</span><span className="ma-record-value">{formatTime(record.timeOut)}</span></div>
                        {hasRemarks && record.remarks && (
                          <div className="ma-record-row"><span className="ma-record-label"><FiMessageCircle /> Remarks</span><span className="ma-record-value">{record.remarks}</span></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

          </>
        )}
      </main>
    </div>
  );
}

function Card({ className = "", children }) {
  return <div className={`ma-card ${className}`.trim()}>{children}</div>;
}

function SkeletonView() {
  return (
    <div className="ma-skeleton">
      <div className="ma-skel-hero ma-card">
        <div className="ma-skel-avatar" />
        <div className="ma-skel-line ma-skel-line--title" />
        <div className="ma-skel-line ma-skel-line--meta" />
      </div>
      <div className="ma-stats ma-stats-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="ma-skel-stat ma-card">
            <div className="ma-skel-icon" />
            <div className="ma-skel-line ma-skel-line--stat" />
            <div className="ma-skel-line ma-skel-line--stat ma-skel-line--stat2" />
          </div>
        ))}
      </div>
      <div className="ma-skel-rate ma-card">
        <div className="ma-skel-line ma-skel-line--rate" />
        <div className="ma-skel-bar" />
        <div className="ma-skel-line ma-skel-line--interp" />
      </div>
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <div key={i} className="ma-skel-row ma-card" />
      ))}
    </div>
  );
}

function ErrorView({ message, sub, onRetry }) {
  return (
    <div className="ma-error ma-card">
      <div className="ma-error-icon" aria-hidden><FiFileText /></div>
      <h3 className="ma-error-title">{message}</h3>
      <p className="ma-error-sub">{sub}</p>
      <button type="button" className="ui-btn ui-btn-primary ma-error-btn" onClick={onRetry}>
        <FiRefreshCw /> Retry
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="ma-empty ma-card">
      <div className="ma-empty-icon" aria-hidden><FiCalendar /></div>
      <h3 className="ma-empty-title">No attendance records yet</h3>
      <p className="ma-empty-body">
        Your attendance records will appear here once you check in to a KATAGA activity.
      </p>
    </div>
  );
}