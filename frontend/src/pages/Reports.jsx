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
import { useSettings } from "../context/SettingsContext";
import { formatHourLabel, getHour, normalizeStatus } from "../components/analytics/analyticsUtils";
import "../styles/Reports.css";
import { authFetch } from "../services/apiClient";
import { getCurrentMonthLocal, buildMonthLabel } from "../config/attendancePolicy";

/**
 * Analytics & Reports — True Analytics Dashboard (frontend-only redesign).
 * Branding (org name/logo) comes from the shared SettingsContext.
 * Reuses existing attendance API endpoints. No CRUD, no duplicate table.
 */
function Reports() {
  const labels = useOrgLabels();
  const { settings: organizationSettings } = useSettings();
  const [records, setRecords] = useState([]);
  const [dashboardStats, setDashboardStats] = useState({ totalParticipants: 0, presentToday: 0, lateToday: 0, absentToday: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Monthly analytics period filter — current month by default.
  const initialMonth = getCurrentMonthLocal();
  const [periodMode, setPeriodMode] = useState("month"); // month | year | range | all
  const [periodMonth, setPeriodMonth] = useState(`${initialMonth.year}-${String(initialMonth.month).padStart(2, "0")}`);
  const [periodYear, setPeriodYear] = useState(String(initialMonth.year));
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  // Client-side date filtering of the fetched records (fetches remain via
  // the existing /attendance/history endpoint — no duplicate endpoints).
  const filteredRecords = useMemo(() => {
    return (records || []).filter((record) => {
      const recordDate = String(record.attendanceDate || "").slice(0, 10);
      if (!recordDate) return false;
      if (periodMode === "month" && periodMonth) {
        return recordDate.slice(0, 7) === periodMonth;
      }
      if (periodMode === "year" && periodYear) {
        return recordDate.slice(0, 4) === periodYear;
      }
      if (periodMode === "range") {
        if (rangeFrom && recordDate < rangeFrom) return false;
        if (rangeTo && recordDate > rangeTo) return false;
      }
      return true; // "all"
    });
  }, [records, periodMode, periodMonth, periodYear, rangeFrom, rangeTo]);

  const periodLabel = useMemo(() => {
    if (periodMode === "month" && periodMonth) {
      const [y, m] = periodMonth.split("-").map(Number);
      return buildMonthLabel(y, m);
    }
    if (periodMode === "year") return `Year ${periodYear}`;
    if (periodMode === "range" && (rangeFrom || rangeTo)) return `${rangeFrom || "…"} → ${rangeTo || "…"}`;
    return "All Time";
  }, [periodMode, periodMonth, periodYear, rangeFrom, rangeTo]);

  // Fetch all attendance records (single request, existing endpoint).
  const fetchAllRecords = async () => {
    await Promise.resolve(); // defer sync setState out of the effect body
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

  // ── KPI computation (frontend, scoped to the selected period) ────────
  const kpis = useMemo(() => {
    const records = filteredRecords;
    const total = records.length;
    const present = records.filter((r) => normalizeStatus(r.status) === "present").length;
    const late = records.filter((r) => normalizeStatus(r.status) === "late").length;
    const absent = records.filter((r) => normalizeStatus(r.status) === "absent").length;
    const excused = records.filter((r) => normalizeStatus(r.status) === "excused").length;
    const attendanceRate = total > 0 ? Math.round((present / (present + late + absent)) * 100) : 0;

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
      present,
      late,
      actualAbsent: absent,
      excused,
      attendanceRate,
      averageCheckIn,
      totalParticipants: dashboardStats.totalParticipants,
      activeToday,
      periodLabel,
    };
  }, [filteredRecords, dashboardStats, periodLabel]);

  return (
    <div className="an-page">
      {error ? <div className="an-message an-message--error">{error}</div> : null}

      <AnalyticsHeader
        title={`${organizationSettings?.orgName || "Analytics"} — Reports`}
        subtitle={`Monitor ${organizationSettings?.orgName || "organization"} activities, generate reports, and gain meaningful insights from member records.`}
      />

      {loading ? (
        <div className="an-loading">Loading analytics data…</div>
      ) : (
        <>
          {/* Period filter */}
          <div className="an-card" style={{ padding: "14px 18px", marginBottom: 18 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "end" }}>
              <div className="an-field" style={{ minWidth: 200 }}>
                <label className="an-field-label">Analytics Period — {periodLabel}</label>
                <select
                  className="an-field-control"
                  value={periodMode}
                  onChange={(e) => setPeriodMode(e.target.value)}
                >
                  <option value="month">Current / Specific Month</option>
                  <option value="year">Specific Year</option>
                  <option value="range">Custom Date Range</option>
                  <option value="all">All Time</option>
                </select>
              </div>
              {periodMode === "month" ? (
                <div className="an-field">
                  <label className="an-field-label">Month</label>
                  <input
                    type="month"
                    className="an-field-control"
                    value={periodMonth}
                    onChange={(e) => setPeriodMonth(e.target.value)}
                  />
                </div>
              ) : periodMode === "year" ? (
                <div className="an-field">
                  <label className="an-field-label">Year</label>
                  <input
                    type="number"
                    min="1900"
                    max="2100"
                    className="an-field-control"
                    value={periodYear}
                    onChange={(e) => setPeriodYear(e.target.value)}
                  />
                </div>
              ) : periodMode === "range" ? (
                <>
                  <div className="an-field">
                    <label className="an-field-label">From</label>
                    <input type="date" className="an-field-control" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
                  </div>
                  <div className="an-field">
                    <label className="an-field-label">To</label>
                    <input type="date" className="an-field-control" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <KpiCards kpis={kpis} />

          <div className="an-grid an-grid--trend">
            <AttendanceTrendChart records={filteredRecords} />
            <AttendanceStatusChart records={filteredRecords} />
          </div>

          <div className="an-grid an-grid--3col">
            <CourseChart records={filteredRecords} />
            <YearLevelChart records={filteredRecords} />
            <SectionChart records={filteredRecords} />
          </div>

          <div className="an-grid an-grid--2col">
            <AttendanceTimeline records={filteredRecords} />
            <QuickInsights records={filteredRecords} />
          </div>

          <ReportGenerator records={filteredRecords} organizationSettings={organizationSettings} labels={labels} />
        </>
      )}
    </div>
  );
}

export default Reports;

