import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { FiEdit2, FiTrash2, FiChevronLeft, FiChevronRight } from "react-icons/fi";

import ConfirmDialog from "../components/participants/ConfirmDialog";
import "../styles/attendance/AttendanceHistory.css";
import { authFetch } from "../services/apiClient";

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
    default:
      return "ah-badge ah-badge--muted";
  }
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
    record.participantIdentifier || "-",
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
    if (dateFilter) params.set("date", dateFilter);
    if (courseFilter) params.set("course", courseFilter);
    if (statusFilter) params.set("status", statusFilter);

    const res = await authFetch(`/attendance/history?${params.toString()}`);
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

  const summary = useMemo(() => {
    const total = records.length;
    const present = records.filter((record) => String(record.status || "").toLowerCase() === "present").length;
    const late = records.filter((record) => String(record.status || "").toLowerCase() === "late").length;
    const absent = records.filter((record) => String(record.status || "").toLowerCase() === "absent").length;
    return { total, present, late, absent };
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
            <label className="ah-label" htmlFor="ah-date">Date</label>
            <input
              id="ah-date"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="ah-control"
            />
          </div>

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
              {statusOptions.map((status) => (
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
                  </select>
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

