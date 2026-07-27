import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import ConfirmDialog from "../components/students/ConfirmDialog";
import { useOrgLabels } from "../config/labels";
import { APP_NAME, APP_TAGLINE } from "../constants";
import "../styles/attendance/AttendanceHistory.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

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

function AttendanceHistory() {
  const [records, setRecords] = useState([]);
  const [printRecords, setPrintRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 });
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [toast, setToast] = useState({ kind: "success", message: "" });
  const [toastVisible, setToastVisible] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editForm, setEditForm] = useState({ attendanceDate: "", timeIn: "", status: "Present" });
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
    record.studentNumber || "-",
    [record.firstName, record.lastName].filter(Boolean).join(" ") || "-",
    record.course || "-",
    record.year || "-",
    record.section || "-",
    formatTime(record.timeIn),
    record.status || "-",
  ]);

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
      if (dateFilter) params.set("date", dateFilter);
      if (courseFilter) params.set("course", courseFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`${API_BASE_URL}/attendance/history?${params.toString()}`);
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
    if (dateFilter) params.set("date", dateFilter);
    if (courseFilter) params.set("course", courseFilter);
    if (statusFilter) params.set("status", statusFilter);

    const res = await fetch(`${API_BASE_URL}/attendance/history?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Unable to export attendance history.");
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

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const columns = ["#", "Date", "Participant Number", "Participant Name", "Department", "Level", "Group", "Time In", "Status"];
      const rows = buildExportRows(exportRows);

      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pageWidth, 72, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text("Organization Name", 40, 32);
      doc.setFontSize(11);
      doc.text("Attendance Management Platform", 40, 52);

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(16);
      doc.text("Attendance Report", 40, 96);
      doc.setFontSize(10);
      doc.text(`Export Date: ${new Date().toLocaleString()}`, 40, 116);

      autoTable(doc, {
        startY: 132,
        head: [columns],
        body: rows,
        styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40 },
        didDrawPage: (data) => {
          const footerText = `Page ${doc.internal.getNumberOfPages()}`;
          doc.setFontSize(8);
          doc.text(footerText, pageWidth - 60, pageHeight - 20);
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

      const columns = ["#", "Date", "Participant Number", "Participant Name", "Department", "Level", "Group", "Time In", "Status"];
      const rows = buildExportRows(exportRows);
      const worksheet = XLSX.utils.aoa_to_sheet([columns, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Report");
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

  const statusOptions = useMemo(() => {
    const values = new Set(records.map((record) => record.status).filter(Boolean));
    return Array.from(values).sort();
  }, [records]);

  const handleApplyFilters = () => {
    fetchHistory(1);
  };

  const handleReset = () => {
    setSearch("");
    setDateFilter("");
    setCourseFilter("");
    setStatusFilter("");
    setTimeout(() => fetchHistory(1), 0);
  };

  const handleOpenEditModal = (record) => {
    setEditingRecord(record);
    setEditForm({
      attendanceDate: formatDate(record.attendanceDate),
      timeIn: record.timeIn ? new Date(record.timeIn).toISOString().slice(0, 16) : "",
      status: record.status || "Present",
    });
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingRecord(null);
    setEditForm({ attendanceDate: "", timeIn: "", status: "Present" });
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
      };

      const res = await fetch(`${API_BASE_URL}/attendance/${editingRecord.id}`, {
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
      const res = await fetch(`${API_BASE_URL}/attendance/${pendingDeleteRecord.id}`, {
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
    <div className="page students-page">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <div>
<h3 style={{ margin: 0 }}>Attendance Records</h3>
          <p style={{ margin: "4px 0 0", color: "#64748b" }}>View and filter all attendance records from the database.</p>
        </div>
        <Link to="/attendance" style={{ color: "#4f46e5", fontWeight: 700, textDecoration: "none" }}>
          Back to Attendance Recording
        </Link>
      </div>

      {toastVisible ? (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 2000, padding: "12px 16px", borderRadius: 10, background: toast.kind === "success" ? "#dcfce7" : "#fee2e2", color: toast.kind === "success" ? "#166534" : "#991b1b", border: `1px solid ${toast.kind === "success" ? "#86efac" : "#fca5a5"}`, boxShadow: "0 10px 24px rgba(15, 23, 42, 0.14)" }}>
          {toast.message}
        </div>
      ) : null}

      <div className="attendance-history-filter-card">
        <div className="attendance-history-filters-grid">
          <div className="filter-item filter-item--search">
            <label className="attendance-history-label" htmlFor="attendance-history-search">Search</label>
            <input
              id="attendance-history-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
placeholder="Participant ID or Name"
              className="attendance-history-control"
            />
          </div>

          <div className="filter-item filter-item--date">
            <label className="attendance-history-label" htmlFor="attendance-history-date">Date</label>
            <input
              id="attendance-history-date"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="attendance-history-control"
            />
          </div>

          <div className="filter-item filter-item--course">
            <label className="attendance-history-label" htmlFor="attendance-history-course">Course / Strand</label>
            <select
              id="attendance-history-course"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="attendance-history-control"
            >
              <option value="">All</option>
              {courseOptions.map((course) => (
                <option key={course} value={course}>{course}</option>
              ))}
            </select>
          </div>

          <div className="filter-item filter-item--status">
            <label className="attendance-history-label" htmlFor="attendance-history-status">Status</label>
            <select
              id="attendance-history-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="attendance-history-control"
            >
              <option value="">All</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="attendance-history-filter-actions">
          <button
            type="button"
            onClick={handleApplyFilters}
            className="attendance-history-button attendance-history-button--primary"
          >
            Apply Filters
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="attendance-history-button attendance-history-button--secondary"
          >
            Reset
          </button>
        </div>
      </div>

      {error ? <div style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</div> : null}
      {exportMessage ? <div style={{ color: "#166534", marginBottom: 12 }}>{exportMessage}</div> : null}

      <div className="attendance-history-actions">
        <button type="button" className="attendance-history-button attendance-history-button--primary" onClick={handleExportPdf}>
          Export PDF
        </button>
        <button type="button" className="attendance-history-button attendance-history-button--secondary" onClick={handleExportExcel}>
          Export Excel
        </button>
        <button type="button" className="attendance-history-button attendance-history-button--secondary" onClick={handlePrint}>
          Print
        </button>
      </div>

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
                <tr key={record.id || `${record.studentNumber}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{formatDate(record.attendanceDate)}</td>
                  <td>{record.studentNumber || "-"}</td>
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

      <div className="attendance-history-table-wrap">
        <div className="attendance-history-table-scroll">
          <table className="attendance-history-table">
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#334155" }}>#</th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#334155" }}>Date</th>
<th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#334155" }}>Participant Number</th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#334155" }}>Participant Name</th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#334155" }}>Course / Strand</th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#334155" }}>Year Level</th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#334155" }}>Section</th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#334155" }}>Time In</th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#334155" }}>Status</th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#334155" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ padding: 20, color: "#64748b" }}>Loading attendance records...</td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 20, color: "#64748b" }}>No attendance records found.</td>
                </tr>
              ) : (
                records.map((record, index) => (
                  <tr key={record.id} style={{ borderTop: "1px solid #eef2ff" }}>
                    <td style={{ padding: "12px 14px" }}>{(pagination.page - 1) * pagination.limit + index + 1}</td>
                    <td style={{ padding: "12px 14px" }}>{formatDate(record.attendanceDate)}</td>
                    <td style={{ padding: "12px 14px" }}>{record.studentNumber || "-"}</td>
                    <td style={{ padding: "12px 14px" }}>{[record.firstName, record.lastName].filter(Boolean).join(" ") || "-"}</td>
                    <td style={{ padding: "12px 14px" }}>{record.course || "-"}</td>
                    <td style={{ padding: "12px 14px" }}>{record.year || "-"}</td>
                    <td style={{ padding: "12px 14px" }}>{record.section || "-"}</td>
                    <td style={{ padding: "12px 14px" }}>{formatTime(record.timeIn)}</td>
                    <td style={{ padding: "12px 14px" }}>{record.status || "-"}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" onClick={() => handleOpenEditModal(record)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #c7d2fe", background: "#eef2ff", color: "#4338ca", cursor: "pointer" }}>
                          Edit
                        </button>
                        <button type="button" onClick={() => handleRequestDelete(record)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", cursor: "pointer" }}>
                          Delete
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

      {isEditModalOpen ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 20px 50px rgba(15, 23, 42, 0.25)" }}>
            <h3 style={{ marginTop: 0 }}>Edit Attendance</h3>
            <form onSubmit={handleSaveEdit}>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Date</label>
                  <input type="date" value={editForm.attendanceDate} onChange={(event) => setEditForm((current) => ({ ...current, attendanceDate: event.target.value }))} required style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }} />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Time In</label>
                  <input type="datetime-local" value={editForm.timeIn} onChange={(event) => setEditForm((current) => ({ ...current, timeIn: event.target.value }))} required style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }} />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Status</label>
                  <select value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))} required style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}>
                    <option value="Present">Present</option>
                    <option value="Late">Late</option>
                    <option value="Absent">Absent</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                <button type="button" onClick={handleCloseEditModal} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSavingRecord} style={{ padding: "10px 14px", borderRadius: 8, border: "none", background: "#4f46e5", color: "#fff", cursor: isSavingRecord ? "wait" : "pointer" }}>
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
        details={pendingDeleteRecord ? `${pendingDeleteRecord.studentNumber || "-"} • ${pendingDeleteRecord.status || "-"}` : null}
      />

      {pagination.pages > 1 ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, flexWrap: "wrap", gap: 12 }}>
          <div style={{ color: "#64748b" }}>Showing {records.length} of {pagination.total} records</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={pagination.page <= 1} onClick={() => fetchHistory(pagination.page - 1)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: pagination.page <= 1 ? "not-allowed" : "pointer" }}>
              Previous
            </button>
            <button type="button" disabled={pagination.page >= pagination.pages} onClick={() => fetchHistory(pagination.page + 1)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: pagination.page >= pagination.pages ? "not-allowed" : "pointer" }}>
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AttendanceHistory;
