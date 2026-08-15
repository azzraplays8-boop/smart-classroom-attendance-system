import { useEffect, useMemo, useState } from "react";
import { FiActivity, FiCalendar, FiCheckCircle, FiClock, FiLoader, FiPercent, FiUserCheck, FiUsers, FiXCircle } from "react-icons/fi";

import { useAuth } from "../hooks/useAuth";
import { API_BASE_URL } from "../config/api";
import "../styles/AttendanceOverview.css";

const STATUS_COLORS = {
  present: "#22c55e",
  late: "#f59e0b",
  absent: "#ef4444",
};

function normalizeStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "present" || normalized === "p") return "present";
  if (normalized === "late" || normalized === "l") return "late";
  if (normalized === "absent" || normalized === "a") return "absent";
  return "present";
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  const raw = String(value).trim();
  if (!raw) return "—";
  const match = raw.match(/^\s*(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?\s*Z?\s*$/i);
  if (!match) return raw;

  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${suffix}`;
}

function getStatusMeta(status) {
  const normalized = normalizeStatus(status);
  return {
    label: normalized.charAt(0).toUpperCase() + normalized.slice(1),
    tone: normalized,
    color: STATUS_COLORS[normalized] || "#64748b",
  };
}

function AttendanceOverview() {
  const { user } = useAuth();
  const [summary, setSummary] = useState({ totalParticipants: 0, presentToday: 0, lateToday: 0, absentToday: 0 });
  const [records, setRecords] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [activitySummary, setActivitySummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOverview = async () => {
    setLoading(true);
    setError("");

    try {
      const today = new Date();
      const month = today.getMonth() + 1;
      const year = today.getFullYear();
      const fromDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

      const [dashboardResult, historyResult, monthlyResult, activityResult] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/attendance/dashboard`),
        fetch(`${API_BASE_URL}/attendance/history?page=1&limit=25`),
        fetch(`${API_BASE_URL}/attendance/monthly-summary?month=${month}&year=${year}`),
        fetch(`${API_BASE_URL}/attendance/activity-summary?from=${fromDate}&to=${toDate}`),
      ]);

      if (dashboardResult.status === "fulfilled") {
        const dashboardData = await dashboardResult.value.json().catch(() => ({}));
        if (dashboardResult.value.ok) {
          setSummary({
            totalParticipants: safeNumber(dashboardData.totalParticipants),
            presentToday: safeNumber(dashboardData.presentToday),
            lateToday: safeNumber(dashboardData.lateToday),
            absentToday: safeNumber(dashboardData.absentToday),
          });
        }
      }

      if (historyResult.status === "fulfilled") {
        const historyData = await historyResult.value.json().catch(() => ({}));
        if (historyResult.value.ok) {
          setRecords(Array.isArray(historyData.records) ? historyData.records : []);
        }
      }

      if (monthlyResult.status === "fulfilled") {
        const monthlyData = await monthlyResult.value.json().catch(() => ({}));
        if (monthlyResult.value.ok) {
          setMonthlySummary(monthlyData || null);
        }
      }

      if (activityResult.status === "fulfilled") {
        const activityData = await activityResult.value.json().catch(() => ({}));
        if (activityResult.value.ok) {
          setActivitySummary(Array.isArray(activityData.activities) ? activityData.activities : []);
        }
      }

      const hasAnyResponse = [dashboardResult, historyResult, monthlyResult, activityResult].some(
        (result) => result.status === "fulfilled" && result.value.ok
      );

      if (!hasAnyResponse) {
        setError("Attendance data is unavailable right now.");
      }
    } catch {
      setError("Unable to load attendance overview. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();

    const onAttendanceChange = () => fetchOverview();
    window.addEventListener("attendance-records-changed", onAttendanceChange);

    return () => {
      window.removeEventListener("attendance-records-changed", onAttendanceChange);
    };
  }, []);

  const attendanceRate = useMemo(() => {
    const totalParticipants = safeNumber(summary.totalParticipants);
    const checkIns = safeNumber(summary.presentToday) + safeNumber(summary.lateToday);
    if (!totalParticipants) return 0;
    return Math.round((checkIns / totalParticipants) * 100);
  }, [summary]);

  const dateBuckets = useMemo(() => {
    const counts = new Map();

    for (const record of records) {
      const key = String(record.attendanceDate || "").slice(0, 10);
      if (!key) continue;
      const current = counts.get(key) || { present: 0, late: 0, absent: 0, total: 0 };
      const status = normalizeStatus(record.status);
      current[status] += 1;
      current.total += 1;
      counts.set(key, current);
    }

    return Array.from(counts.entries())
      .map(([date, value]) => ({
        date,
        label: formatDateLabel(date),
        total: value.total,
        present: value.present,
        late: value.late,
        absent: value.absent,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6);
  }, [records]);

  const recentRecords = useMemo(() => records.slice(0, 6), [records]);
  const presentCount = safeNumber(summary.presentToday);
  const lateCount = safeNumber(summary.lateToday);
  const absentCount = safeNumber(summary.absentToday);
  const totalCheckedIn = presentCount + lateCount;

  return (
    <div className="ao-page">
      <header className="ao-header">
        <div>
          <div className="ao-eyebrow">KATAGA Portal</div>
          <h1>Attendance Overview</h1>
        </div>
        <div className="ao-header-actions">
          <span className="ao-view-pill">{user?.role ? user.role.replace("_", " ") : "Viewer"} view</span>
        </div>
      </header>

      {error ? <div className="ao-message ao-message--error">{error}</div> : null}

      {loading ? (
        <div className="ao-loading">
          <FiLoader className="ao-spin" />
          Loading attendance overview…
        </div>
      ) : (
        <>
          <section className="ao-kpi-grid">
            <article className="ao-kpi ao-kpi--primary">
              <div className="ao-kpi-icon">
                <FiUsers />
              </div>
              <div>
                <div className="ao-kpi-label">Members</div>
                <div className="ao-kpi-value">{summary.totalParticipants}</div>
              </div>
            </article>

            <article className="ao-kpi ao-kpi--success">
              <div className="ao-kpi-icon">
                <FiCheckCircle />
              </div>
              <div>
                <div className="ao-kpi-label">Present</div>
                <div className="ao-kpi-value">{presentCount}</div>
              </div>
            </article>

            <article className="ao-kpi ao-kpi--warning">
              <div className="ao-kpi-icon">
                <FiClock />
              </div>
              <div>
                <div className="ao-kpi-label">Late</div>
                <div className="ao-kpi-value">{lateCount}</div>
              </div>
            </article>

            <article className="ao-kpi ao-kpi--danger">
              <div className="ao-kpi-icon">
                <FiXCircle />
              </div>
              <div>
                <div className="ao-kpi-label">Absent</div>
                <div className="ao-kpi-value">{absentCount}</div>
              </div>
            </article>

            <article className="ao-kpi ao-kpi--violet">
              <div className="ao-kpi-icon">
                <FiPercent />
              </div>
              <div>
                <div className="ao-kpi-label">Attendance Rate</div>
                <div className="ao-kpi-value">{attendanceRate}%</div>
              </div>
            </article>
          </section>

          <section className="ao-grid">
            <article className="ao-card">
              <div className="ao-card-header">
                <div>
                  <p className="ao-card-eyebrow">Today</p>
                  <h2>Attendance summary</h2>
                </div>
                <span className="ao-card-badge">{totalCheckedIn} checked in</span>
              </div>

              <div className="ao-status-list">
                <div className="ao-status-row">
                  <span className="ao-status-dot ao-status-dot--present" />
                  <span>Present</span>
                  <strong>{presentCount}</strong>
                </div>
                <div className="ao-status-row">
                  <span className="ao-status-dot ao-status-dot--late" />
                  <span>Late</span>
                  <strong>{lateCount}</strong>
                </div>
                <div className="ao-status-row">
                  <span className="ao-status-dot ao-status-dot--absent" />
                  <span>Absent</span>
                  <strong>{absentCount}</strong>
                </div>
              </div>

              <div className="ao-meter" aria-label="Attendance progress">
                <span
                  className="ao-meter-segment ao-meter-segment--present"
                  style={{ width: `${summary.totalParticipants ? (presentCount / summary.totalParticipants) * 100 : 0}%` }}
                />
                <span
                  className="ao-meter-segment ao-meter-segment--late"
                  style={{ width: `${summary.totalParticipants ? (lateCount / summary.totalParticipants) * 100 : 0}%` }}
                />
                <span
                  className="ao-meter-segment ao-meter-segment--absent"
                  style={{ width: `${summary.totalParticipants ? (absentCount / summary.totalParticipants) * 100 : 0}%` }}
                />
              </div>
            </article>

            <article className="ao-card">
              <div className="ao-card-header">
                <div>
                  <p className="ao-card-eyebrow">This month</p>
                  <h2>Monthly attendance</h2>
                </div>
                <span className="ao-card-badge ao-card-badge--violet">
                  {monthlySummary ? `${monthlySummary.attendanceRate ?? 0}%` : "0%"}
                </span>
              </div>

              {monthlySummary ? (
                <div className="ao-monthly-summary">
                  <div className="ao-monthly-metric">
                    <span>Records</span>
                    <strong>{monthlySummary.totalRecords ?? 0}</strong>
                  </div>
                  <div className="ao-monthly-metric">
                    <span>Present</span>
                    <strong>{monthlySummary.present ?? 0}</strong>
                  </div>
                  <div className="ao-monthly-metric">
                    <span>Late</span>
                    <strong>{monthlySummary.late ?? 0}</strong>
                  </div>
                  <div className="ao-monthly-metric">
                    <span>Absent</span>
                    <strong>{monthlySummary.absent ?? 0}</strong>
                  </div>
                </div>
              ) : (
                <div className="ao-empty">No monthly summary available yet.</div>
              )}
            </article>
          </section>

          <section className="ao-grid">
            <article className="ao-card">
              <div className="ao-card-header">
                <div>
                  <p className="ao-card-eyebrow">Latest</p>
                  <h2>Recent attendance records</h2>
                </div>
                <span className="ao-card-badge">{records.length} total</span>
              </div>

              {recentRecords.length ? (
                <ul className="ao-record-list">
                  {recentRecords.map((record) => {
                    const statusMeta = getStatusMeta(record.status);
                    const memberName = [record.firstName, record.lastName].filter(Boolean).join(" ") || "Unknown member";

                    return (
                      <li key={record.id ?? `${record.participantId}-${record.attendanceDate}-${record.timeIn}`} className="ao-record-item">
                        <div className="ao-record-main">
                          <div className="ao-avatar">{memberName.charAt(0).toUpperCase()}</div>
                          <div>
                            <div className="ao-record-name">{memberName}</div>
                            <div className="ao-record-meta">{record.participantIdentifier || "—"} • {formatDateLabel(record.attendanceDate)}</div>
                          </div>
                        </div>
                        <div className="ao-record-side">
                          <span className="ao-status-label" style={{ backgroundColor: `${statusMeta.color}18`, color: statusMeta.color }}>
                            {statusMeta.label}
                          </span>
                          <small>{formatTime(record.timeIn)}</small>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="ao-empty">No attendance records were found for the current period.</div>
              )}
            </article>

            <article className="ao-card">
              <div className="ao-card-header">
                <div>
                  <p className="ao-card-eyebrow">By date</p>
                  <h2>Attendance records by date</h2>
                </div>
                <span className="ao-card-badge">{dateBuckets.length} dates</span>
              </div>

              {dateBuckets.length ? (
                <ul className="ao-date-list">
                  {dateBuckets.map((day) => (
                    <li key={day.date} className="ao-date-item">
                      <div>
                        <strong>{day.label}</strong>
                        <span>{day.total} records</span>
                      </div>
                      <div className="ao-date-breakdown">
                        <span className="ao-mini-pill ao-mini-pill--present">P {day.present}</span>
                        <span className="ao-mini-pill ao-mini-pill--late">L {day.late}</span>
                        <span className="ao-mini-pill ao-mini-pill--absent">A {day.absent}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="ao-empty">No per-date breakdown available yet.</div>
              )}
            </article>
          </section>

          <article className="ao-card ao-card--full">
            <div className="ao-card-header">
              <div>
                <p className="ao-card-eyebrow">Team activity</p>
                <h2>Activities / Events</h2>
              </div>
              <span className="ao-card-badge ao-card-badge--violet">
                <FiActivity />
                {activitySummary.length} departments
              </span>
            </div>

            {activitySummary.length ? (
              <div className="ao-activity-grid">
                {activitySummary.map((item) => (
                  <div key={item.department || "unknown"} className="ao-activity-card">
                    <div className="ao-activity-header">
                      <strong>{item.department || "Unassigned"}</strong>
                      <span>{item.totalRecords ?? 0} records</span>
                    </div>
                    <div className="ao-activity-metrics">
                      <span><em>Present</em> {item.present ?? 0}</span>
                      <span><em>Late</em> {item.late ?? 0}</span>
                      <span><em>Absent</em> {item.absent ?? 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ao-empty">No activity summary is available for this period.</div>
            )}
          </article>
        </>
      )}
    </div>
  );
}

export default AttendanceOverview;
