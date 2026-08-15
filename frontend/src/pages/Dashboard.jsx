import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiUsers,
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiPercent,
  FiUserCheck,
  FiDatabase,
  FiActivity,
  FiCamera,
  FiUserPlus,
  FiList,
  FiBarChart2,
  FiFileText,
  FiSettings,
  FiPlay,
  FiSun,
  FiSunrise,
FiSunset,
  FiMoon,
  FiCalendar,
  FiGlobe,
  FiLoader,
  FiZap,
  FiServer,
  FiCheck,
  FiAlertTriangle,
  FiRefreshCw,
} from "react-icons/fi";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import "../styles/Dashboard.css";
import { useAuth } from "../hooks/useAuth";
import { useSettings } from "../context/SettingsContext";
import { useOrgLabels } from "../config/labels";
import { APP_NAME } from "../constants";
import { authFetch } from "../services/apiClient";
import {
  addDays,
  formatFullDate,
  formatShortDate,
  formatTime,
  getDaysBetween,
  normalizeStatus,
  todayString,
} from "../components/analytics/analyticsUtils";

const STATUS_COLORS = {
  present: "#22c55e",
  late: "#f59e0b",
  absent: "#ef4444",
};

function GreetingClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hour = now.getHours();
  let greeting = "Good Evening";
  let Icon = FiMoon;
  if (hour < 12) {
    greeting = "Good Morning";
    Icon = FiSunrise;
  } else if (hour < 18) {
    greeting = "Good Afternoon";
    Icon = FiSun;
  } else if (hour < 21) {
    greeting = "Good Evening";
    Icon = FiSunset;
  }

  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return { greeting, Icon, time, date };
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="db-chart-tooltip">
      {label ? <div className="db-chart-tooltip-label">{label}</div> : null}
      {payload.map((entry) => (
        <div key={entry.dataKey} className="db-chart-tooltip-row">
          <span className="db-chart-tooltip-dot" style={{ background: entry.color || entry.payload?.fill }} />
          <span className="db-chart-tooltip-name">{entry.name}:</span>
          <span className="db-chart-tooltip-value">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const { settings: orgSettings } = useSettings();
  const labels = useOrgLabels();

  const [stats, setStats] = useState({ totalParticipants: 0, presentToday: 0, lateToday: 0, absentToday: 0 });
  const [records, setRecords] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [sessionSettings, setSessionSettings] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { greeting, Icon, time, date } = GreetingClock();

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError("");
    const errors = [];

    // 1) Participants (accurate total count)
    try {
      const res = await authFetch("/participants");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load participants");
      setParticipantCount(Array.isArray(data.participants) ? data.participants.length : 0);
    } catch (err) {
      errors.push(`Participants: ${err?.message || "error"}`);
    }

    // 2) Dashboard stats
    try {
      const res = await authFetch("/attendance/dashboard");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load dashboard stats");
      setStats({
        totalParticipants: Number(data?.totalParticipants ?? 0) || 0,
        presentToday: Number(data?.presentToday ?? 0) || 0,
        lateToday: Number(data?.lateToday ?? 0) || 0,
        absentToday: Number(data?.absentToday ?? 0) || 0,
      });
    } catch (err) {
      errors.push(`Dashboard: ${err?.message || "error"}`);
    }

    // 3) Attendance history (all records for total count, recent activity & charts)
    try {
      const params = new URLSearchParams({ page: "1", limit: "10000" });
      const res = await authFetch(`/attendance/history?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load attendance history");
      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (err) {
      errors.push(`History: ${err?.message || "error"}`);
    }

    // 4) Session settings
    try {
      const res = await authFetch("/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load settings");
      setSessionSettings(data?.settings || null);
    } catch (err) {
      errors.push(`Settings: ${err?.message || "error"}`);
    }

    // 5) Health check
    try {
      const res = await authFetch("/health");
      const data = await res.json();
      setHealth({ ok: res.ok && data?.ok === true });
    } catch {
      setHealth({ ok: false });
    }

    if (errors.length > 0) setError(errors.join(" | "));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const handleAttendanceChange = () => fetchDashboardData();
    window.addEventListener("attendance-records-changed", handleAttendanceChange);
    return () => window.removeEventListener("attendance-records-changed", handleAttendanceChange);
  }, [fetchDashboardData]);

  // ── Derived KPI data ──────────────────────────────────────
  const today = todayString();
  const todayRecords = useMemo(
    () => records.filter((r) => String(r.attendanceDate || "").slice(0, 10) === today),
    [records, today]
  );

  const todayCounts = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    for (const record of todayRecords) {
      const status = normalizeStatus(record.status);
      if (status === "present") present += 1;
      else if (status === "late") late += 1;
      else if (status === "absent") absent += 1;
    }
    return { present, late, absent };
  }, [todayRecords]);

  const totalParticipants = participantCount || stats.totalParticipants || 0;
  const presentToday = todayCounts.present || stats.presentToday || 0;
  const lateToday = todayCounts.late || stats.lateToday || 0;
  const absentToday = todayCounts.absent || stats.absentToday || 0;
  const todayCheckIns = presentToday + lateToday;
  const totalRecords = records.length;
  const attendanceRate = totalParticipants > 0 ? Math.round((todayCheckIns / totalParticipants) * 100) : 0;

  // ── Recent activity (latest 5) ────────────────────────────
  const recentActivity = useMemo(() => records.slice(0, 5), [records]);

  // ── 7-day trend ───────────────────────────────────────────
  const trendData = useMemo(() => {
    const days = getDaysBetween(addDays(today, -6), today);
    const byDate = new Map();
    for (const day of days) byDate.set(day, { present: 0, late: 0, absent: 0 });
    for (const record of records) {
      const dateStr = String(record.attendanceDate || "").slice(0, 10);
      const bucket = byDate.get(dateStr);
      if (!bucket) continue;
      const status = normalizeStatus(record.status);
      if (status === "present") bucket.present += 1;
      else if (status === "late") bucket.late += 1;
      else if (status === "absent") bucket.absent += 1;
      else bucket.present += 1;
    }
    return days.map((day) => ({
      label: formatShortDate(day),
      fullDate: day,
      present: byDate.get(day)?.present || 0,
      late: byDate.get(day)?.late || 0,
      absent: byDate.get(day)?.absent || 0,
    }));
  }, [records, today]);

  // ── Today's status distribution (donut) ───────────────────
  const statusData = useMemo(() => {
    const total = presentToday + lateToday + absentToday;
    return [
      { key: "present", name: "Present", value: presentToday, fill: STATUS_COLORS.present, percent: total > 0 ? Math.round((presentToday / total) * 100) : 0 },
      { key: "late", name: "Late", value: lateToday, fill: STATUS_COLORS.late, percent: total > 0 ? Math.round((lateToday / total) * 100) : 0 },
      { key: "absent", name: "Absent", value: absentToday, fill: STATUS_COLORS.absent, percent: total > 0 ? Math.round((absentToday / total) * 100) : 0 },
    ];
  }, [presentToday, lateToday, absentToday]);
  const statusTotal = presentToday + lateToday + absentToday;

  // ── Session status badge ──────────────────────────────────
  const sessionStatus = useMemo(() => {
    const start = sessionSettings?.attendanceStartTime || "07:30";
    const end = sessionSettings?.attendanceEndTime || "17:00";
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const [sh, sm] = (start || "07:30").split(":").map(Number);
    const [eh, em] = (end || "17:00").split(":").map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    if (nowMinutes < startMinutes) return { label: "Not Started", tone: "idle" };
    if (nowMinutes > endMinutes) return { label: "Ended", tone: "ended" };
    return { label: "In Progress", tone: "active" };
  }, [sessionSettings]);

  const orgName =
    sessionSettings?.orgName ||
    sessionSettings?.organizationName ||
    sessionSettings?.schoolName ||
    orgSettings.organizationName ||
    labels.orgLabel ||
    "—";

  const adminName = user?.full_name || "Administrator";

  const kpis = [
    { key: "totalParticipants", label: labels.registeredMemberLabel || "Total Participants", value: totalParticipants, icon: <FiUsers />, tone: "indigo" },
    { key: "presentToday", label: labels.checkedInLabel || "Present Today", value: presentToday, icon: <FiCheckCircle />, tone: "green" },
    { key: "lateToday", label: labels.lateLabel || "Late Today", value: lateToday, icon: <FiClock />, tone: "amber" },
    { key: "absentToday", label: labels.absentLabel || "Absent Today", value: absentToday, icon: <FiXCircle />, tone: "red" },
    { key: "attendanceRate", label: "Attendance Rate", value: attendanceRate, suffix: "%", icon: <FiPercent />, tone: "violet" },
    { key: "todayCheckIns", label: "Today's Check-ins", value: todayCheckIns, icon: <FiUserCheck />, tone: "teal" },
    { key: "totalRecords", label: "Total Attendance Records", value: totalRecords, icon: <FiDatabase />, tone: "blue" },
    { key: "activeSession", label: "Active Session", value: sessionStatus.label, icon: <FiActivity />, tone: "slate" },
  ];

  const quickActions = [
    { to: "/attendance", label: "Start Session", icon: <FiPlay />, tone: "primary", desc: "Begin / continue attendance recording" },
    { to: "/attendance", label: "Open Attendance Scanner", icon: <FiCamera />, tone: "blue", desc: "Scan QR codes to mark attendance" },
    { to: "/participants", label: "Manage Participants", icon: <FiUserPlus />, tone: "green", desc: "Add, edit or remove participants" },
    { to: "/attendance-history", label: "Attendance History", icon: <FiList />, tone: "amber", desc: "View and export attendance records" },
    { to: "/reports", label: "Analytics & Reports", icon: <FiBarChart2 />, tone: "violet", desc: "Monitor trends and generate insights" },
    { to: "/reports", label: "Generate Report", icon: <FiFileText />, tone: "teal", desc: "Create a downloadable attendance report" },
    { to: "/settings", label: "Settings", icon: <FiSettings />, tone: "slate", desc: "Configure organization and system" },
  ];

  const sessionInfoRows = [
    { icon: <FiClock />, label: "Attendance Start", value: sessionSettings?.attendanceStartTime ? formatTime(sessionSettings.attendanceStartTime) : "07:30 AM" },
    { icon: <FiAlertTriangle />, label: "Late Cutoff", value: sessionSettings?.lateCutoffTime ? formatTime(sessionSettings.lateCutoffTime) : "08:00 AM" },
    { icon: <FiSunset />, label: "Attendance End", value: sessionSettings?.attendanceEndTime ? formatTime(sessionSettings.attendanceEndTime) : "05:00 PM" },
{ icon: <FiGlobe />, label: "Timezone", value: sessionSettings?.timezone || orgSettings.timezone || "(UTC+08:00) Asia/Manila" },
    { icon: <FiLoader />, label: "Grace Period", value: sessionSettings?.gracePeriod || orgSettings.gracePeriod || "None" },
    { icon: <FiZap />, label: "Attendance Mode", value: sessionSettings?.attendanceMode || orgSettings.attendanceMode || "QR + Manual" },
  ];

  const activityStatusClass = (status) => {
    const s = normalizeStatus(status);
    if (s === "present") return "db-badge db-badge--present";
    if (s === "late") return "db-badge db-badge--late";
    if (s === "absent") return "db-badge db-badge--absent";
    return "db-badge db-badge--muted";
  };

  return (
    <div className="db-page">
      {error ? (
        <div className="db-message db-message--error">
          <FiAlertTriangle size={16} /> Some data could not be loaded: {error}
        </div>
      ) : null}

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="db-hero">
        <div className="db-hero-glow" aria-hidden="true" />
        <div className="db-hero-main">
          <div className="db-hero-icon" aria-hidden="true"><Icon /></div>
          <div className="db-hero-text">
            <h2 className="db-hero-title">{greeting}, {adminName}</h2>
            <p className="db-hero-subtitle">
              Welcome to your {APP_NAME} command center. Here is today's snapshot at {orgName}.
            </p>
            <div className="db-hero-meta">
              <span className="db-hero-meta-item"><FiCalendar size={14} /> {date}</span>
              <span className="db-hero-meta-item"><FiClock size={14} /> {time}</span>
            </div>
          </div>
        </div>
        <div className={`db-session-badge db-session-badge--${sessionStatus.tone}`}>
          <span className="db-session-dot" />
          <span className="db-session-label">Session</span>
          <span className="db-session-value">{sessionStatus.label}</span>
        </div>
      </section>

      {/* ── KPI Cards ────────────────────────────────────── */}
      <section className="db-kpi-grid">
        {kpis.map((kpi) => (
          <div key={kpi.key} className={`db-kpi db-kpi--${kpi.tone}`}>
            <div className={`db-kpi-icon db-kpi-icon--${kpi.tone}`}>{kpi.icon}</div>
            <div className="db-kpi-meta">
              <span className="db-kpi-label">{kpi.label}</span>
              <span className="db-kpi-value">
                {kpi.value}
                {kpi.suffix ? <span className="db-kpi-suffix">{kpi.suffix}</span> : null}
              </span>
            </div>
          </div>
        ))}
      </section>

      {/* ── Charts Row ───────────────────────────────────── */}
      <section className="db-grid db-grid--charts">
        <div className="db-card">
          <div className="db-card-header">
            <div>
              <h3 className="db-card-title">Today's Status Distribution</h3>
              <p className="db-card-subtitle">Present · Late · Absent breakdown</p>
            </div>
          </div>
          {statusTotal === 0 ? (
            <div className="db-chart-empty">No attendance records today.</div>
          ) : (
            <div className="db-status-layout">
              <div className="db-donut">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="62%"
                      outerRadius="86%"
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {statusData.map((entry) => (
                        <Cell key={entry.key} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="db-donut-center">
                  <div className="db-donut-center-value">{statusTotal}</div>
                  <div className="db-donut-center-label">Total</div>
                </div>
              </div>
              <div className="db-status-legend">
                {statusData.map((entry) => (
                  <div key={entry.key} className="db-status-legend-row">
                    <span className="db-status-legend-dot" style={{ background: entry.fill }} />
                    <span className="db-status-legend-name">{entry.name}</span>
                    <span className="db-status-legend-count">{entry.value}</span>
                    <span className="db-status-legend-percent">{entry.percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="db-card">
          <div className="db-card-header">
            <div>
              <h3 className="db-card-title">Last 7 Days Attendance Trend</h3>
              <p className="db-card-subtitle">Daily check-ins over the past week</p>
            </div>
          </div>
          <div className="db-chart-legend">
            <span className="db-legend-item db-legend-item--present">Present</span>
            <span className="db-legend-item db-legend-item--late">Late</span>
            <span className="db-legend-item db-legend-item--absent">Absent</span>
          </div>
          <div className="db-chart db-chart--md">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="dbGradPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={STATUS_COLORS.present} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={STATUS_COLORS.present} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="dbGradLate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={STATUS_COLORS.late} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={STATUS_COLORS.late} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="dbGradAbsent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={STATUS_COLORS.absent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={STATUS_COLORS.absent} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted-2)", fontSize: 12 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted-2)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="present" name="Present" stroke={STATUS_COLORS.present} strokeWidth={2.5} fill="url(#dbGradPresent)" />
                <Area type="monotone" dataKey="late" name="Late" stroke={STATUS_COLORS.late} strokeWidth={2.5} fill="url(#dbGradLate)" />
                <Area type="monotone" dataKey="absent" name="Absent" stroke={STATUS_COLORS.absent} strokeWidth={2.5} fill="url(#dbGradAbsent)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ── Quick Actions + Recent Activity + Session ────── */}
      <section className="db-grid db-grid--lower">
        <div className="db-card db-card--quick">
          <div className="db-card-header">
            <div>
              <h3 className="db-card-title">Quick Actions</h3>
              <p className="db-card-subtitle">Common tasks and shortcuts</p>
            </div>
          </div>
          <div className="db-quick-grid">
            {quickActions.map((action) => (
              <Link key={action.label} to={action.to} className={`db-quick db-quick--${action.tone}`}>
                <span className={`db-quick-icon db-quick-icon--${action.tone}`}>{action.icon}</span>
                <span className="db-quick-meta">
                  <span className="db-quick-label">{action.label}</span>
                  <span className="db-quick-desc">{action.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="db-grid db-grid--stack">
          <div className="db-card">
            <div className="db-card-header">
              <div>
                <h3 className="db-card-title">Recent Activity</h3>
                <p className="db-card-subtitle">Latest attendance records</p>
              </div>
              <Link to="/attendance-history" className="db-link">View all</Link>
            </div>
            {recentActivity.length === 0 ? (
              <div className="db-empty">
                <FiActivity size={26} />
                <p>No attendance records yet.</p>
                <Link to="/attendance" className="db-empty-link">Start a session</Link>
              </div>
            ) : (
              <div className="db-activity">
                {recentActivity.map((record) => (
                  <div key={record.id} className="db-activity-item">
                    <div className="db-activity-avatar">
                      {(record.firstName || "P").charAt(0).toUpperCase()}
                    </div>
                    <div className="db-activity-meta">
                      <span className="db-activity-name">
                        {[record.firstName, record.lastName].filter(Boolean).join(" ") || record.participantIdentifier || "-"}
                      </span>
                      <span className="db-activity-sub">
                        {record.participantIdentifier || "-"} · {formatFullDate(record.attendanceDate)} · {formatTime(record.timeIn)}
                      </span>
                    </div>
                    <span className={activityStatusClass(record.status)}>{record.status || "-"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="db-card">
            <div className="db-card-header">
              <div>
                <h3 className="db-card-title">Today's Session</h3>
                <p className="db-card-subtitle">Configured attendance rules</p>
              </div>
            </div>
            <div className="db-session-grid">
              {sessionInfoRows.map((row) => (
                <div key={row.label} className="db-session-row">
                  <span className="db-session-icon">{row.icon}</span>
                  <span className="db-session-label">{row.label}</span>
                  <span className="db-session-value">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── System Status ────────────────────────────────── */}
      <section className="db-card">
        <div className="db-card-header">
          <div>
            <h3 className="db-card-title">System Status</h3>
            <p className="db-card-subtitle">Live status of core services</p>
          </div>
        </div>
        <div className="db-status-grid">
          <div className="db-system-item">
            <span className="db-system-icon db-system-icon--ok"><FiServer /></span>
            <div className="db-system-meta">
              <span className="db-system-name">API Server</span>
              <span className="db-system-status db-system-status--ok">
                <FiCheck size={12} /> {health?.ok ? "Operational" : "Checking…"}
              </span>
            </div>
          </div>
          <div className="db-system-item">
            <span className="db-system-icon db-system-icon--local"><FiRefreshCw /></span>
            <div className="db-system-meta">
              <span className="db-system-name">QR Scanner</span>
              <span className="db-system-status db-system-status--local">Local status</span>
            </div>
          </div>
          <div className="db-system-item">
            <span className="db-system-icon db-system-icon--ok"><FiDatabase /></span>
            <div className="db-system-meta">
              <span className="db-system-name">Attendance Records</span>
              <span className="db-system-status db-system-status--ok">{totalRecords} records</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
