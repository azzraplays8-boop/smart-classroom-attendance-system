import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

import ConfirmDialog from "../components/students/ConfirmDialog";
import StudentPhoto from "../components/students/StudentPhoto";
import { useOrgLabels } from "../config/labels";
import { APP_NAME } from "../constants";
import "../styles/Reports.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function formatDate(value) {
  if (!value) return "-";
  const trimmed = String(value).trim();
  if (!trimmed) return "-";
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : trimmed;
}

function formatTime(value) {
  if (!value) return "-";

  const raw = String(value).trim();
  if (!raw) return "-";

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  }

  const m = raw.match(/^\s*(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?\s*Z?\s*$/i);
  if (!m) return raw;

  const hours24 = Number(m[1]);
  const minutes = m[2];
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes} ${suffix}`;
}

function dispatchAttendanceChange() {
  window.dispatchEvent(new CustomEvent("attendance-records-changed"));
}

function Reports() {
  const labels = useOrgLabels();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [toast, setToast] = useState({ kind: "success", message: "" });
  const [toastVisible, setToastVisible] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editForm, setEditForm] = useState({ attendanceDate: "", timeIn: "", status: "Present" });
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [schoolSettings, setSchoolSettings] = useState({ schoolName: "", schoolLogo: "" });

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/settings`);
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

  useEffect(() => {
    fetchSettings();
  }, []);

  const showToast = (kind, message) => {
    setToast({ kind, message });
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 2600);
  };

  const fetchReports = async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ page: "1", limit: "1000" });
      if (search.trim()) params.set("search", search.trim());
      if (dateFilter) params.set("date", dateFilter);
      if (courseFilter) params.set("course", courseFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`${API_BASE_URL}/attendance/history?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Unable to load reports.");
      }

      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (err) {
      setError(err?.message || "Unable to load reports.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const courseOptions = useMemo(() => {
    const values = new Set(records.map((record) => record.course).filter(Boolean));
    return Array.from(values).sort();
  }, [records]);

  const statusOptions = useMemo(() => {
    const values = new Set(records.map((record) => record.status).filter(Boolean));
    return Array.from(values).sort();
  }, [records]);

  const summary = useMemo(() => {
    const total = records.length;
    const present = records.filter((record) => String(record.status || "").toLowerCase() === "present").length;
    const late = records.filter((record) => String(record.status || "").toLowerCase() === "late").length;
    const absent = records.filter((record) => String(record.status || "").toLowerCase() === "absent").length;

    return { total, present, late, absent };
  }, [records]);

  const handleApplyFilters = () => {
    fetchReports();
  };

  const handleReset = () => {
    setSearch("");
    setDateFilter("");
    setCourseFilter("");
    setStatusFilter("");
    setTimeout(() => fetchReports(), 0);
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
      await fetchReports();
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
      await fetchReports();
    } catch (err) {
      showToast("error", err?.message || "Failed to delete attendance record.");
    } finally {
      setIsDeletingRecord(false);
    }
  };

  const getFiltersLabel = () => {
    const parts = [];
    if (search.trim()) parts.push(`Search: "${search.trim()}"`);
    if (dateFilter) parts.push(`Date: ${dateFilter}`);
    if (courseFilter) parts.push(`Course: ${courseFilter}`);
    if (statusFilter) parts.push(`Status: ${statusFilter}`);
    return parts.length ? parts.join(" | ") : "None";
  };

  const handleExportPDF = async () => {
    if (records.length === 0) {
      showToast("error", "No records available to export.");
      return;
    }

    try {
      const doc = new jsPDF("landscape", "mm", "a4");

      if (schoolSettings.schoolLogo) {
        try {
          doc.addImage(schoolSettings.schoolLogo, "JPEG", 14, 10, 25, 25);
        } catch {
          // Skip logo if image loading fails
        }
      }

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(schoolSettings.schoolName || "Organization Name", 45, 20);

      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text("Attendance Report", 45, 30);

      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
      doc.text(`Generated: ${dateStr}`, 45, 36);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Filters: ${getFiltersLabel()}`, 14, 46);

      const tableColumns = ["#", "Date", "Participant #", "Participant Name", "Department", "Level", "Group", "Time In", "Status"];
      const tableRows = records.map((r, i) => [
        i + 1,
        formatDate(r.attendanceDate),
        r.studentNumber || "-",
        [r.firstName, r.lastName].filter(Boolean).join(" ") || "-",
        r.course || "-",
        r.year || "-",
        r.section || "-",
        formatTime(r.timeIn),
        r.status || "-",
      ]);

      doc.autoTable({
        startY: 50,
        head: [tableColumns],
        body: tableRows,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      const finalY = doc.lastAutoTable.finalY || 50;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`Total Records: ${records.length}`, 14, finalY + 10);

      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Generated by Attendance Management Platform", 14, finalY + 18);

      doc.save("Attendance_Report.pdf");
      showToast("success", "PDF exported successfully.");
    } catch (err) {
      showToast("error", "Failed to export PDF.");
      console.error("PDF export error:", err);
    }
  };

  const handleExportExcel = () => {
    if (records.length === 0) {
      showToast("error", "No records available to export.");
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      const wsData = [
        [`${schoolSettings.schoolName || "Organization"} — Attendance Report`],
        [`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}`],
        [`Filters: ${getFiltersLabel()}`],
        [],
        ["Date", "Participant Number", "Participant Name", "Department", "Level", "Group", "Time In", "Status"],
      ];

      records.forEach((r) => {
        wsData.push([
          formatDate(r.attendanceDate),
          r.studentNumber || "-",
          [r.firstName, r.lastName].filter(Boolean).join(" ") || "-",
          r.course || "-",
          r.year || "-",
          r.section || "-",
          formatTime(r.timeIn),
          r.status || "-",
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
      ];

      const colWidths = [12, 18, 25, 18, 12, 12, 12, 12];
      ws["!cols"] = colWidths.map((w) => ({ wch: w }));

      XLSX.utils.book_append_sheet(wb, ws, "Attendance");
      XLSX.writeFile(wb, "Attendance_Report.xlsx");
      showToast("success", "Excel exported successfully.");
    } catch (err) {
      showToast("error", "Failed to export Excel.");
      console.error("Excel export error:", err);
    }
  };

  const handlePrint = () => {
    if (records.length === 0) {
      showToast("error", "No records available to export.");
      return;
    }
    window.print();
  };

  return (
    <div className="reports-page">
      {toastVisible ? (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 2000, padding: "12px 16px", borderRadius: 10, background: toast.kind === "success" ? "#dcfce7" : "#fee2e2", color: toast.kind === "success" ? "#166534" : "#991b1b", border: `1px solid ${toast.kind === "success" ? "#86efac" : "#fca5a5"}`, boxShadow: "0 10px 24px rgba(15, 23, 42, 0.14)" }}>
          {toast.message}
        </div>
      ) : null}

      <div className="reports-summary-grid">
        <div className="reports-summary-card">
          <h3>Total Attendance Records</h3>
          <p>{summary.total}</p>
        </div>
        <div className="reports-summary-card">
          <h3>Checked In</h3>
          <p>{summary.present}</p>
        </div>
        <div className="reports-summary-card">
          <h3>Late</h3>
          <p>{summary.late}</p>
        </div>
        <div className="reports-summary-card">
          <h3>Absent</h3>
          <p>{summary.absent}</p>
        </div>
      </div>

      <div className="reports-filter-card">
        <div className="reports-filters-grid">
          {/* Row 1 */}
          <div className="filter-item">
            <label className="attendance-history-label" htmlFor="reports-search">Search</label>
            <input
              id="reports-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={labels.entityName ? `${labels.primaryIdLabel || "ID"} or Name` : "Participant ID or Name"}
              className="reports-control"
            />
          </div>

          <div className="filter-item">
            <label className="attendance-history-label" htmlFor="reports-date">Date</label>
            <input
              id="reports-date"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="reports-control"
            />
          </div>

          {/* Row 2 */}
          <div className="filter-item">
            <label className="attendance-history-label" htmlFor="reports-course">{labels.departmentLabel || "Course / Strand"}</label>
            <select
              id="reports-course"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="reports-control"
            >
              <option value="">All</option>
              {courseOptions.map((course) => (
                <option key={course} value={course}>{course}</option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label className="attendance-history-label" htmlFor="reports-status">Status</label>
            <select
              id="reports-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="reports-control"
            >
              <option value="">All</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3 (actions) */}
        <div className="reports-actions">
          <button type="button" className="reports-button reports-button--primary" onClick={handleApplyFilters}>
            Apply Filters
          </button>
          <button type="button" className="reports-button reports-button--secondary" onClick={handleReset}>
            Reset
          </button>
        </div>
      </div>

      {error ? <div style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</div> : null}

      <div className="reports-export-bar">
        <button
          type="button"
          className="reports-export-btn reports-export-btn--pdf"
          onClick={handleExportPDF}
          disabled={records.length === 0}
          title={records.length === 0 ? "No records available to export." : "Export as PDF"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Export PDF
          {records.length === 0 && <span className="reports-export-empty-note">No records</span>}
        </button>
        <button
          type="button"
          className="reports-export-btn reports-export-btn--excel"
          onClick={handleExportExcel}
          disabled={records.length === 0}
          title={records.length === 0 ? "No records available to export." : "Export as Excel"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
          Export Excel
          {records.length === 0 && <span className="reports-export-empty-note">No records</span>}
        </button>
        <button
          type="button"
          className="reports-export-btn reports-export-btn--print"
          onClick={handlePrint}
          disabled={records.length === 0}
          title={records.length === 0 ? "No records available to export." : "Print Report"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print Report
          {records.length === 0 && <span className="reports-export-empty-note">No records</span>}
        </button>
      </div>

      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
<tr>
              <th>#</th>
              <th>Photo</th>
              <th>Date</th>
              <th>Participant Number</th>
              <th>Participant Name</th>
              <th>Department</th>
              <th>Level</th>
              <th>Group</th>
              <th>Time In</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} style={{ padding: 20, color: "#64748b" }}>Loading attendance records...</td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: 20, color: "#64748b" }}>No attendance records found.</td>
              </tr>
            ) : (
              records.map((record, index) => (
                <tr key={record.id || `${record.studentNumber}-${index}`}>
                  <td>{index + 1}</td>
                  <td>
                    <StudentPhoto
                      photoPath={record.photo}
                      studentName={`${record.firstName || ""} ${record.lastName || ""}`.trim()}
                      size={40}
                      alt="Participant photo"
                    />
                  </td>
                  <td>{formatDate(record.attendanceDate)}</td>
                  <td>{record.studentNumber || "-"}</td>
                  <td>{[record.firstName, record.lastName].filter(Boolean).join(" ") || "-"}</td>
                  <td>{record.course || "-"}</td>
                  <td>{record.year || "-"}</td>
                  <td>{record.section || "-"}</td>
                  <td>{formatTime(record.timeIn)}</td>
                  <td>{record.status || "-"}</td>
                  <td>
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
    </div>
  );
}

export default Reports;


