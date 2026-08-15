import { useEffect, useMemo, useState } from "react";

import AnalyticsHeader from "../components/analytics/AnalyticsHeader";
import KpiCards from "../components/analytics/KpiCards";
import AttendanceTrendChart from "../components/analytics/AttendanceTrendChart";
import AttendanceStatusChart from "../components/analytics/AttendanceStatusChart";
import CourseChart from "../components/analytics/CourseChart";
import YearLevelChart from "../components/analytics/YearLevelChart";
import SectionChart from "../components/analytics/SectionChart";
import AttendanceTimeline from "../components/analytics/AttendanceTimeline";
import QuickInsights from "../components/analytics/QuickInsights";
import ReportGenerator from "../components/analytics/ReportGenerator";
import { useOrgLabels } from "../config/labels";
import { formatHourLabel, getHour, normalizeStatus } from "../components/analytics/analyticsUtils";
import "../styles/Reports.css";
import { authFetch } from "../services/apiClient";

/**
 * KATAGA Portal Reports — True Analytics Dashboard (frontend-only redesign).
 * Reuses existing attendance API endpoints. No CRUD, no duplicate table.
 */
function Reports() {
  const labels = useOrgLabels();
  const [records, setRecords] = useState([]);
  const [dashboardStats, setDashboardStats] = useState({ totalParticipants: 0, presentToday: 0, lateToday: 0, absentToday: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [organizationSettings, setSchoolSettings] = useState({ schoolName: "", schoolLogo: "" });

  // Fetch school settings (name/logo) for report exports.
  const fetchSettings = async () => {
    try {
      const res = await authFetch("/settings");
      const data = await res.json();
      if (res.ok && data.settings) {
        setSchoolSettings({
          schoolName: data.settings.schoolName || "",
          schoolLogo: data.settings.schoolLogo || "",
        });
      }
    } catch {
      // Silently fail — settings not critical for app functionality
    }
  };

  // Fetch all attendance records (single request, existing endpoint).
  const fetchAllRecords = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: "1", limit: "10000" });
      const res = await authFetch(`/attendance/history?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Unable to load analytics data.");
      }
      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (err) {
      setError(err?.message || "Unable to load analytics data.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch dashboard stats (existing endpoint) for KPIs.
  const fetchDashboardStats = async () => {
    try {
      const res = await authFetch("/attendance/dashboard");
      const data = await res.json();
      if (res.ok) {
        setDashboardStats({
          totalParticipants: Number(data?.totalParticipants ?? 0) || 0,
          presentToday: Number(data?.presentToday ?? 0) || 0,
          lateToday: Number(data?.lateToday ?? 0) || 0,
          absentToday: Number(data?.absentToday ?? 0) || 0,
        });
      }
    } catch {
      // Keep existing dashboard stats on failure
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchAllRecords();
    fetchDashboardStats();

    const handleAttendanceChange = () => {
      fetchAllRecords();
      fetchDashboardStats();
    };
    window.addEventListener("attendance-records-changed", handleAttendanceChange);

    return () => {
      window.removeEventListener("attendance-records-changed", handleAttendanceChange);
    };
  }, []);

  // ── KPI computation (frontend) ───────────────────────────
  const kpis = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => normalizeStatus(r.status) === "present").length;
    const late = records.filter((r) => normalizeStatus(r.status) === "late").length;
    const absent = records.filter((r) => normalizeStatus(r.status) === "absent").length;
    const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;

    // Average check-in time (hours + minutes)
    const hours = [];
    for (const record of records) {
      const hour = getHour(record.timeIn);
      if (hour !== null && hour !== undefined) hours.push(hour);
    }
    let averageCheckIn = "-";
    if (hours.length > 0) {
      const avg = hours.reduce((sum, h) => sum + h, 0) / hours.length;
      averageCheckIn = formatHourLabel(Math.round(avg));
    }

    // Active participants today
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const activeToday = records.filter((r) => String(r.attendanceDate || "").slice(0, 10) === todayStr).length;

    return {
      totalRecords: total,
      presentToday: dashboardStats.presentToday,
      lateToday: dashboardStats.lateToday,
      absentToday: dashboardStats.absentToday,
      attendanceRate,
      averageCheckIn,
      totalParticipants: dashboardStats.totalParticipants,
      activeToday,
    };
  }, [records, dashboardStats]);

  return (
    <div className="an-page">
      {error ? <div className="an-message an-message--error">{error}</div> : null}

      <AnalyticsHeader
        title="KATAGA Portal Reports"
        subtitle="Monitor KATAGA Portal activities, generate reports, and gain meaningful insights from member records."
      />

      {loading ? (
        <div className="an-loading">Loading analytics data…</div>
      ) : (
        <>
          <KpiCards kpis={kpis} />

          <div className="an-grid an-grid--trend">
            <AttendanceTrendChart records={records} />
            <AttendanceStatusChart records={records} />
          </div>

          <div className="an-grid an-grid--3col">
            <CourseChart records={records} />
            <YearLevelChart records={records} />
            <SectionChart records={records} />
          </div>

          <div className="an-grid an-grid--2col">
            <AttendanceTimeline records={records} />
            <QuickInsights records={records} />
          </div>

          <ReportGenerator records={records} organizationSettings={organizationSettings} labels={labels} />
        </>
      )}
    </div>
  );
}

export default Reports;

