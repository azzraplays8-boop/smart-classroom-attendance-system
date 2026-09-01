import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { FiEdit2, FiTrash2, FiChevronLeft, FiChevronRight } from "react-icons/fi";

import ConfirmDialog from "../components/participants/ConfirmDialog";
import "../styles/attendance/AttendanceHistory.css";
import { authFetch } from "../services/apiClient";
import { getCurrentMonthLocal, buildMonthLabel } from "../config/attendancePolicy";

function formatDate(value) {
  if (!value) return "-";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "-";
    return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : trimmed;
  }
  return String(value);
}

function formatTime(value) {
  if (!value) return "-";

  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!raw) return "-";

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  }

  const m = raw.match(/^\s*(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?\s*Z?\s*$/i);
  if (!m) return raw;

  const hours24 = Number(m[1]);
  const minutes = m[2];
  if (!Number.isFinite(hours24)) return raw;

  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes} ${suffix}`;
}

function dispatchAttendanceChange() {
  window.dispatchEvent(new CustomEvent("attendance-records-changed"));
}

function getStatusBadgeClass(status) {
  switch (String(status || "").toLowerCase()) {
    case "present":
      return "ah-badge ah-badge--present";
    case "late":
      return "ah-badge ah-badge--late";
    case "absent":
      return "ah-badge ah-badge--absent";
    case "excused":
      return "ah-badge ah-badge--excused";
    default:
      return "ah-badge ah-badge--muted";
  }
}

const MONTH_STATUSES = ["Present", "Late", "Absent", "Excused"];

function AttendanceHistory() {
  const [records, setRecords] = useState([]);
  const [printRecords, setPrintRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 });
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Period filter: current month by default; month | date | range | all
  const initialMonth = getCurrentMonthLocal();
  const [periodMode, setPeriodMode] = useState("month"); // month | date | range | all
  const [periodMonth, setPeriodMonth] = useState(`${initialMonth.year}-${String(initialMonth.month).padStart(2, "0")}`);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [toast, setToast] = useState({ kind: "success", message: "" });
  const [toastVisible, setToastVisible] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editForm, setEditForm] = useState({ attendanceDate: "", timeIn: "", status: "Present", remarks: "" });
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);

  const showToast = (kind, message) => {
    setToast({ kind, message });
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 2600);
  };

  const buildExportRows = (rows) => rows.map((record, index) => [
    index + 1,
    formatDate(record.attendanceDate),
    record.participantIdentifier || "-",
    [record.firstName, record.lastName].filter(Boolean).join(" ") || "-",
    record.course || "-",
    record.year || "-",
    record.section || "-",
    formatTime(record.timeIn),
    record.status || "-",
  ]);

  const buildPeriodParams = (params) => {
    if (periodMode === "month" && periodMonth) {
      const [y, m] = periodMonth.split("-").map(Number);
      if (y && m) {
        params.set("period", "month");
        params.set("month", String(m));
        params.set("year", String(y));
      }
    } else if (periodMode === "date" && dateFilter) {
      params.set("date", dateFilter);
    } else if (periodMode === "range") {
      if (rangeFrom) params.set("from", rangeFrom);
      if (rangeTo) params.set("to", rangeTo);
    }
    // periodMode === "all" → no date params sent
  };

  const fetchHistory = async (nextPage = 1) => {
    setLoading(true);
    setError("");
    setExportMessage("");

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: "25",
      });

      if (search.trim()) params.set("search", search.trim());
      if (courseFilter) params.set("course", courseFilter);
      if (statusFilter) params.set("status", statusFilter);
      buildPeriodParams(params);

      const res = await authFetch(`/attendance/history?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Unable to load attendance history.");
      }

      const nextRecords = data.records || [];
      setRecords(nextRecords);
      setPrintRecords(nextRecords);
      setPagination(data.pagination || { page: 1, limit: 25, total: 0, pages: 1 });
    } catch (err) {
      setError(err?.message || "Unable to load attendance history.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllFilteredRecords = async () => {
    const params = new URLSearchParams({
      page: "1",
      limit: "10000",
    });

    if (search.trim()) params.set("search", search.trim());
    if (courseFilter) params.set("course", courseFilter);
    if (statusFilter) params.set("status", statusFilter);
    buildPeriodParams(params);

    const res = await authFetch(`/attendance/history?${params.toString()}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.message || "Unable to export attendance history.");
    }

    return Array.isArray(data.records) ? data.records : [];
  };

  const handleExportPdf = async () => {
    try {
      const exportRows = await fetchAllFilteredRecords();
      if (!exportRows.length) {
        setError("No attendance records available for export.");
        setExportMessage("");
        return;
      }

      setError("");
      setExportMessage("");

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const generatedAt = new Date();
      const summary = {
        total: exportRows.length,
        present: exportRows.filter((r) => String(r.status || "").toLowerCase() === "present").length,
        late: exportRows.filter((r) => String(r.status || "").toLowerCase() === "late").length,
        absent: exportRows.filter((r) => String(r.status || "").toLowerCase() === "absent").length,
        excused: exportRows.filter((r) => String(r.status || "").toLowerCase() === "excused").length,
      };

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 80, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("KATAGA", 42, 34);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Kapatiran ng Talino at Galing", 42, 52);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.text(`Generated On: ${generatedAt.toLocaleString()}`, pageWidth - 200, 34);
      doc.text(`Generated By: ${"System Admin"}`, pageWidth - 200, 50);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("ATTENDANCE REPORT", 42, 112);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Report Period: ${periodLabel || "All Records"}`, 42, 128);
      doc.text(`Applied Filters: ${search || "All"} | ${statusFilter || "All Status"} | ${courseFilter || "All Courses"}`, 42, 142);

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(42, 156, pageWidth - 84, 46, 6, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("SUMMARY", 54, 176);
      doc.setFont("helvetica", "normal");
      doc.text(`Total Records: ${summary.total}`, 54, 192);
      doc.text(`Present: ${summary.present}   Late: ${summary.late}   Absent: ${summary.absent}   Excused: ${summary.excused}`, 54, 206);

      const columns = ["#", "Date", "Participant ID", "Participant Name", "Course/Department", "Year", "Section", "Time In", "Status"];
      const rows = exportRows.map((record, index) => [
        index + 1,
        formatDate(record.attendanceDate),
        record.participantIdentifier || "-",
        [record.firstName, record.lastName].filter(Boolean).join(" ") || "-",
        record.department || record.course || "-",
        record.year || "-",
        record.section || record.group_name || "-",
        formatTime(record.timeIn),
        record.status || "-",
      ]);

      autoTable(doc, {
        startY: 218,
        head: [columns],
        body: rows,
        styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak", textColor: [15, 23, 42] },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 42, right: 42 },
        theme: "grid",
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(71, 85, 105);
          doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - 60, pageHeight - 18);
        },
      });

      doc.save("attendance-report.pdf");
      setExportMessage("PDF exported successfully.");
    } catch (err) {
      setError(err?.message || "Unable to export PDF.");
      setExportMessage("");
    }
  };

  const handleExportExcel = async () => {
    try {
      const exportRows = await fetchAllFilteredRecords();
      if (!exportRows.length) {
        setError("No attendance records available for export.");
        setExportMessage("");
        return;
      }

      setError("");
      setExportMessage("");

      const workbook = XLSX.utils.book_new();
      const recordsSheetRows = [
        ["KATAGA"],
        ["Kapatiran ng Talino at Galing"],
        ["ATTENDANCE REPORT"],
        ["Report Period", periodLabel || "All Records"],
        ["Generated Date", new Date().toLocaleString()],
        ["Applied Filters", `${search || "All"} | ${statusFilter || "All Status"} | ${courseFilter || "All Courses"}`],
        [],
        ["#", "Date", "Participant ID", "Participant Name", "Email", "Course / Department", "Year Level", "Section", "Activity / Event", "Time In", "Time Out", "Status", "Excuse / Reason"],
      ];

      exportRows.forEach((record, index) => {
        recordsSheetRows.push([
          index + 1,
          formatDate(record.attendanceDate),
          record.participantIdentifier || "-",
          [record.firstName, record.lastName].filter(Boolean).join(" ") || "-",
          record.email || "-",
          record.department || record.course || "-",
          record.year || "-",
          record.section || record.group_name || "-",
          record.activity || "-",
          formatTime(record.timeIn),
          formatTime(record.timeOut),
          record.status || "-",
          record.remarks || "-",
        ]);
      });

      const recordsSheet = XLSX.utils.aoa_to_sheet(recordsSheetRows);
      recordsSheet["!cols"] = [
        { wch: 6 }, { wch: 14 }, { wch: 16 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }
      ];
      recordsSheet["!freeze"] = { xSplit: 0, ySplit: 8 };

      const summaryRows = [
        ["Summary"],
        ["Total Attendance Records", exportRows.length],
        ["Present Count", exportRows.filter((r) => String(r.status || "").toLowerCase() === "present").length],
        ["Late Count", exportRows.filter((r) => String(r.status || "").toLowerCase() === "late").length],
        ["Absent Count", exportRows.filter((r) => String(r.status || "").toLowerCase() === "absent").length],
        ["Excused Count", exportRows.filter((r) => String(r.status || "").toLowerCase() === "excused").length],
        [],
        ["Participant", "Present", "Late", "Absent", "Excused", "Attendance Rate"],
      ];

      const participantMap = new Map();
      exportRows.forEach((record) => {
        const key = [record.firstName, record.lastName].filter(Boolean).join(" ") || record.participantIdentifier || "Unknown";
        if (!participantMap.has(key)) participantMap.set(key, { present: 0, late: 0, absent: 0, excused: 0, total: 0 });
        const item = participantMap.get(key);
        item.total += 1;
        const status = String(record.status || "").toLowerCase();
        if (status === "present") item.present += 1;
        else if (status === "late") item.late += 1;
        else if (status === "absent") item.absent += 1;
        else if (status === "excused") item.excused += 1;
      });

      participantMap.forEach((value, participant) => {
        const total = value.present + value.late + value.absent + value.excused || 1;
        const rate = Math.round((value.present / total) * 100);
        summaryRows.push([participant, value.present, value.late, value.absent, value.excused, `${rate}%`]);
      });

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }];

      XLSX.utils.book_append_sheet(workbook, recordsSheet, "Attendance Records");
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
      XLSX.writeFile(workbook, "attendance-report.xlsx");
      setExportMessage("Excel exported successfully.");
    } catch (err) {
      setError(err?.message || "Unable to export Excel.");
      setExportMessage("");
    }
  };

  const handlePrint = async () => {
    try {
      const exportRows = await fetchAllFilteredRecords();
      if (!exportRows.length) {
        setError("No attendance records available for export.");
        setExportMessage("");
        return;
      }

      setError("");
      setExportMessage("");
      setPrintRecords(exportRows);
      setTimeout(() => {
        window.print();
      }, 100);
    } catch (err) {
      setError(err?.message || "Unable to print attendance report.");
      setExportMessage("");
    }
  };

  useEffect(() => {
    fetchHistory(1);
  }, []);

  const courseOptions = useMemo(() => {
    const values = new Set(records.map((record) => record.course).filter(Boolean));
    return Array.from(values).sort();
  }, [records]);

  const summary = useMemo(() => {
    const total = records.length;
    const present = records.filter((record) => String(record.status || "").toLowerCase() === "present").length;
    const late = records.filter((record) => String(record.status || "").toLowerCase() === "late").length;
    const absent = records.filter((record) => String(record.status || "").toLowerCase() === "absent").length;
    const excused = records.filter((record) => String(record.status || "").toLowerCase() === "excused").length;
    return { total, present, late, absent, excused };
  }, [records]);

  const periodLabel = useMemo(() => {
    if (periodMode === "month" && periodMonth) {
      const [y, m] = periodMonth.split("-").map(Number);
      return buildMonthLabel(y, m);
    }
    if (periodMode === "date" && dateFilter) return dateFilter;
    if (periodMode === "range" && (rangeFrom || rangeTo)) return `${rangeFrom || "…"} → ${rangeTo || "…"}`;
    return "All Time";
  }, [periodMode, periodMonth, dateFilter, rangeFrom, rangeTo]);

  const handleApplyFilters = () => {
    fetchHistory(1);
  };

  const handleReset = () => {
    setSearch("");
    setDateFilter("");
    setCourseFilter("");
    setStatusFilter("");
    setRangeFrom("");
    setRangeTo("");
    const now = getCurrentMonthLocal();
    setPeriodMode("month");
    setPeriodMonth(`${now.year}-${String(now.month).padStart(2, "0")}`);
    setTimeout(() => fetchHistory(1), 0);
  };

  const handleOpenEditModal = (record) => {
    setEditingRecord(record);
    setEditForm({
      attendanceDate: formatDate(record.attendanceDate),
      timeIn: record.timeIn ? new Date(record.timeIn).toISOString().slice(0, 16) : "",
      status: record.status || "Present",
      remarks: record.remarks || "",
    });
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingRecord(null);
    setEditForm({ attendanceDate: "", timeIn: "", status: "Present", remarks: "" });
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    if (!editingRecord?.id) return;

    try {
      setIsSavingRecord(true);
      const payload = {
        attendanceDate: editForm.attendanceDate,
        timeIn: editForm.timeIn ? new Date(editForm.timeIn).toISOString() : null,
        status: editForm.status,
        remarks: editForm.status === "Excused" ? (editForm.remarks || "Excused by admin") : undefined,
      };

      const res = await authFetch(`/attendance/${editingRecord.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.message || "Failed to update attendance record.");
      }

      handleCloseEditModal();
      showToast("success", "Attendance record updated successfully.");
      dispatchAttendanceChange();
      await fetchHistory(pagination.page);
    } catch (err) {
      showToast("error", err?.message || "Failed to update attendance record.");
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleRequestDelete = (record) => {
    setPendingDeleteRecord(record);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteRecord?.id) return;

    try {
      setIsDeletingRecord(true);
      const res = await authFetch(`/attendance/${pendingDeleteRecord.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.message || "Failed to delete attendance record.");
      }

      setPendingDeleteRecord(null);
      showToast("success", "Attendance record deleted successfully.");
      dispatchAttendanceChange();
      await fetchHistory(pagination.page);
    } catch (err) {
      showToast("error", err?.message || "Failed to delete attendance record.");
    } finally {
      setIsDeletingRecord(false);
    }
  };

  return (
    <div className="page ah-page">
      {toastVisible ? (
        <div className={`ah-toast ah-toast--${toast.kind}`} role="status">
          {toast.message}
        </div>
      ) : null}

      {/* Header */}
      <div className="ah-header">
        <div className="ah-header-left">
          <h2 className="ah-title">Attendance History</h2>
          <p className="ah-subtitle">View, search, filter, export and manage attendance records.</p>
        </div>
        <Link to="/attendance" className="ah-back-link">
          Back to Attendance Recording
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="ah-stats-grid">
        <div className="ah-stat-card ah-stat-card--present">
          <div className="ah-stat-icon ah-stat-icon--present">✅</div>
          <div className="ah-stat-meta">
            <div className="ah-stat-label">Present</div>
            <div className="ah-stat-value">{summary.present}</div>
          </div>
        </div>
        <div className="ah-stat-card ah-stat-card--late">
          <div className="ah-stat-icon ah-stat-icon--late">🟡</div>
          <div className="ah-stat-meta">
            <div className="ah-stat-label">Late</div>
            <div className="ah-stat-value">{summary.late}</div>
          </div>
        </div>
        <div className="ah-stat-card ah-stat-card--absent">
          <div className="ah-stat-icon ah-stat-icon--absent">🔴</div>
          <div className="ah-stat-meta">
            <div className="ah-stat-label">Absent</div>
            <div className="ah-stat-value">{summary.absent}</div>
          </div>
        </div>
        <div className="ah-stat-card ah-stat-card--total">
          <div className="ah-stat-icon ah-stat-icon--total">📊</div>
          <div className="ah-stat-meta">
            <div className="ah-stat-label">Total Records</div>
            <div className="ah-stat-value">{summary.total}</div>
          </div>
        </div>
        <div className="ah-stat-card ah-stat-card--excused">
          <div className="ah-stat-icon ah-stat-icon--excused">📝</div>
          <div className="ah-stat-meta">
            <div className="ah-stat-label">Excused</div>
            <div className="ah-stat-value">{summary.excused}</div>
          </div>
        </div>
      </div>

      {/* Period indicator */}
      <div className="ah-period-indicator">
        <span className="ah-period-label">Attendance Period</span>
        <span className="ah-period-value">{periodLabel}</span>
      </div>

      {/* Filters */}
      <div className="ah-card ah-filter-card">
        <div className="ah-filters-grid">
          <div className="ah-filter-item">
            <label className="ah-label" htmlFor="ah-search">Search Participant</label>
            <input
              id="ah-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Participant ID or Name"
              className="ah-control"
            />
          </div>

          <div className="ah-filter-item">
            <label className="ah-label" htmlFor="ah-period-mode">Period</label>
            <select
              id="ah-period-mode"
              value={periodMode}
              onChange={(e) => setPeriodMode(e.target.value)}
              className="ah-control"
            >
              <option value="month">Current / Specific Month</option>
              <option value="date">Specific Date</option>
              <option value="range">Custom Date Range</option>
              <option value="all">All Time</option>
            </select>
          </div>

          {periodMode === "month" ? (
            <div className="ah-filter-item">
              <label className="ah-label" htmlFor="ah-period-month">Month</label>
              <input
                id="ah-period-month"
                type="month"
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
                className="ah-control"
              />
            </div>
          ) : periodMode === "date" ? (
            <div className="ah-filter-item">
              <label className="ah-label" htmlFor="ah-date">Date</label>
              <input
                id="ah-date"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="ah-control"
              />
            </div>
          ) : periodMode === "range" ? (
            <>
              <div className="ah-filter-item">
                <label className="ah-label" htmlFor="ah-range-from">From</label>
                <input
                  id="ah-range-from"
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="ah-control"
                />
              </div>
              <div className="ah-filter-item">
                <label className="ah-label" htmlFor="ah-range-to">To</label>
                <input
                  id="ah-range-to"
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="ah-control"
                />
              </div>
            </>
          ) : null}

          <div className="ah-filter-item">
            <label className="ah-label" htmlFor="ah-course">Course</label>
            <select
              id="ah-course"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="ah-control"
            >
              <option value="">All</option>
              {courseOptions.map((course) => (
                <option key={course} value={course}>{course}</option>
              ))}
            </select>
          </div>

          <div className="ah-filter-item">
            <label className="ah-label" htmlFor="ah-status">Status</label>
            <select
              id="ah-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="ah-control"
            >
              <option value="">All</option>
              {MONTH_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="ah-filter-actions">
          <button type="button" onClick={handleApplyFilters} className="ah-btn ah-btn--primary">
            Search
          </button>
          <button type="button" onClick={handleReset} className="ah-btn ah-btn--outline">
            Reset
          </button>
        </div>
      </div>

      {error ? <div className="ah-message ah-message--error">{error}</div> : null}
      {exportMessage ? <div className="ah-message ah-message--success">{exportMessage}</div> : null}

      {/* Export Toolbar */}
      <div className="ah-export-bar">
        <button type="button" className="ah-export-btn ah-export-btn--pdf" onClick={handleExportPdf}>
          <span aria-hidden="true">📄</span> Export PDF
        </button>
        <button type="button" className="ah-export-btn ah-export-btn--excel" onClick={handleExportExcel}>
          <span aria-hidden="true">📊</span> Export Excel
        </button>
        <button type="button" className="ah-export-btn ah-export-btn--print" onClick={handlePrint}>
          <span aria-hidden="true">🖨</span> Print
        </button>
      </div>

      {/* Printable Report (for print) */}
      <div className="printable-report" aria-hidden="true">
        <div className="printable-report__header">
          <h3>Organization Name</h3>
          <p>Attendance Management Platform</p>
          <h4>Attendance Report</h4>
          <span>Export Date: {new Date().toLocaleString()}</span>
        </div>
        <table className="printable-report__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Participant Number</th>
              <th>Participant Name</th>
              <th>Course / Strand</th>
              <th>Year Level</th>
              <th>Section</th>
              <th>Time In</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {printRecords.length === 0 ? (
              <tr>
                <td colSpan={9}>No attendance records available for export.</td>
              </tr>
            ) : (
              printRecords.map((record, index) => (
                <tr key={record.id || `${record.participantIdentifier}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{formatDate(record.attendanceDate)}</td>
                  <td>{record.participantIdentifier || "-"}</td>
                  <td>{[record.firstName, record.lastName].filter(Boolean).join(" ") || "-"}</td>
                  <td>{record.course || "-"}</td>
                  <td>{record.year || "-"}</td>
                  <td>{record.section || "-"}</td>
                  <td>{formatTime(record.timeIn)}</td>
                  <td>{record.status || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Attendance Table */}
      <div className="ah-table-card">
        <div className="ah-table-card-header">
          <h3 className="ah-table-title">Attendance History</h3>
          <span className="ah-table-count">{pagination.total} record{pagination.total === 1 ? "" : "s"}</span>
        </div>
        <div className="ah-table-scroll">
          <table className="ah-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Participant Number</th>
                <th>Participant Name</th>
                <th>Course / Strand</th>
                <th>Year Level</th>
                <th>Section</th>
                <th>Time In</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="ah-table-state">Loading attendance records...</td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={10} className="ah-table-state">No attendance records found.</td>
                </tr>
              ) : (
                records.map((record, index) => (
                  <tr key={record.id}>
                    <td className="ah-cell-strong">{(pagination.page - 1) * pagination.limit + index + 1}</td>
                    <td>{formatDate(record.attendanceDate)}</td>
                    <td className="ah-cell-strong">{record.participantIdentifier || "-"}</td>
                    <td>{[record.firstName, record.lastName].filter(Boolean).join(" ") || "-"}</td>
                    <td>{record.course || "-"}</td>
                    <td>{record.year || "-"}</td>
                    <td>{record.section || "-"}</td>
                    <td>{formatTime(record.timeIn)}</td>
                    <td>
                      <span className={getStatusBadgeClass(record.status)}>{record.status || "-"}</span>
                    </td>
                    <td>
                      <div className="ah-actions">
                        <button
                          type="button"
                          className="ah-icon-btn ah-icon-btn--edit"
                          title="Edit"
                          aria-label="Edit"
                          onClick={() => handleOpenEditModal(record)}
                        >
                          <FiEdit2 size={15} />
                        </button>
                        <button
                          type="button"
                          className="ah-icon-btn ah-icon-btn--delete"
                          title="Delete"
                          aria-label="Delete"
                          onClick={() => handleRequestDelete(record)}
                        >
                          <FiTrash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pagination.pages > 1 ? (
        <div className="ah-pagination">
          <div className="ah-pagination-info">Showing {records.length} of {pagination.total} records</div>
          <div className="ah-pagination-buttons">
            <button
              type="button"
              className="ah-page-btn"
              disabled={pagination.page <= 1}
              onClick={() => fetchHistory(pagination.page - 1)}
            >
              <FiChevronLeft size={16} /> Previous
            </button>
            <button
              type="button"
              className="ah-page-btn"
              disabled={pagination.page >= pagination.pages}
              onClick={() => fetchHistory(pagination.page + 1)}
            >
              Next <FiChevronRight size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {isEditModalOpen ? (
        <div className="ah-modal-overlay">
          <div className="ah-modal-card">
            <h3 className="ah-modal-title">Edit Attendance</h3>
            <form onSubmit={handleSaveEdit}>
              <div className="ah-modal-form">
                <div className="ah-field">
                  <label className="ah-field-label">Date</label>
                  <input
                    type="date"
                    className="ah-field-control"
                    value={editForm.attendanceDate}
                    onChange={(event) => setEditForm((current) => ({ ...current, attendanceDate: event.target.value }))}
                    required
                  />
                </div>
                <div className="ah-field">
                  <label className="ah-field-label">Time In</label>
                  <input
                    type="datetime-local"
                    className="ah-field-control"
                    value={editForm.timeIn}
                    onChange={(event) => setEditForm((current) => ({ ...current, timeIn: event.target.value }))}
                    required
                  />
                </div>
                <div className="ah-field">
                  <label className="ah-field-label">Status</label>
                  <select
                    className="ah-field-control"
                    value={editForm.status}
                    onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}
                    required
                  >
                    <option value="Present">Present</option>
                    <option value="Late">Late</option>
                    <option value="Absent">Absent</option>
                    <option value="Excused">Excused</option>
                  </select>
                </div>
                <div className="ah-field">
                  <label className="ah-field-label">Reason / Remarks (required when Excused)</label>
                  <input
                    type="text"
                    className="ah-field-control"
                    value={editForm.remarks || ""}
                    onChange={(event) => setEditForm((current) => ({ ...current, remarks: event.target.value }))}
                    placeholder="e.g. Medical appointment (approved excuse)"
                  />
                </div>
              </div>
              <div className="ah-modal-actions">
                <button type="button" className="ah-btn ah-btn--outline" onClick={handleCloseEditModal}>
                  Cancel
                </button>
                <button type="submit" className="ah-btn ah-btn--primary" disabled={isSavingRecord}>
                  {isSavingRecord ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteRecord)}
        title="Delete Attendance Record"
        message="Are you sure you want to permanently delete this attendance record?"
        primaryLabel={isDeletingRecord ? "Deleting..." : "Delete"}
        primaryVariant="danger"
        primaryDisabled={isDeletingRecord}
        onPrimary={handleConfirmDelete}
        onCancel={() => setPendingDeleteRecord(null)}
        details={pendingDeleteRecord ? `${pendingDeleteRecord.participantIdentifier || "-"} • ${pendingDeleteRecord.status || "-"}` : null}
      />
    </div>
  );
}

export default AttendanceHistory;

