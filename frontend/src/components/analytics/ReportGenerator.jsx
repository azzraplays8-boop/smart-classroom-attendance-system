import { useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { FiDownload, FiFileText, FiPrinter, FiRefreshCw, FiSearch } from "react-icons/fi";
import { formatDate, formatTime, todayString } from "./analyticsUtils";

const STATUS_OPTIONS = ["Present", "Late", "Absent"];

/**
 * Dedicated report generator panel.
 * Filters: Date Range, Course, Year Level, Section, Status.
 * Actions: Generate Report, Export PDF, Export Excel, Print Report.
 */
function ReportGenerator({ records, schoolSettings, labels }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [course, setCourse] = useState("");
  const [year, setYear] = useState("");
  const [section, setSection] = useState("");
  const [status, setStatus] = useState("");
  const [generatedAt, setGeneratedAt] = useState(null);
  const [toast, setToast] = useState({ kind: "success", message: "" });
  const [toastVisible, setToastVisible] = useState(false);

  const courseOptions = useMemo(() => {
    const values = new Set((records || []).map((r) => r.department || r.course).filter(Boolean));
    return Array.from(values).sort();
  }, [records]);

  const yearOptions = useMemo(() => {
    const values = new Set((records || []).map((r) => r.year).filter(Boolean));
    return Array.from(values).sort();
  }, [records]);

  const sectionOptions = useMemo(() => {
    const values = new Set((records || []).map((r) => r.section || r.group_name).filter(Boolean));
    return Array.from(values).sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    return (records || []).filter((record) => {
      const recordDate = String(record.attendanceDate || "").slice(0, 10);
      if (startDate && recordDate < startDate) return false;
      if (endDate && recordDate > endDate) return false;
      if (course && String(record.department || record.course || "").trim() !== course) return false;
      if (year && String(record.year || "").trim() !== year) return false;
      if (section && String(record.section || record.group_name || "").trim() !== section) return false;
      if (status && String(record.status || "").trim().toLowerCase() !== status.toLowerCase()) return false;
      return true;
    });
  }, [records, startDate, endDate, course, year, section, status]);

  const showToast = (kind, message) => {
    setToast({ kind, message });
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 2600);
  };

  const handleGenerate = () => {
    setGeneratedAt(new Date());
    showToast("success", `Report generated — ${filteredRecords.length} record${filteredRecords.length === 1 ? "" : "s"}.`);
  };

  const getFiltersLabel = () => {
    const parts = [];
    if (startDate && endDate) parts.push(`Date: ${startDate} → ${endDate}`);
    else if (startDate) parts.push(`From: ${startDate}`);
    else if (endDate) parts.push(`To: ${endDate}`);
    if (course) parts.push(`${labels.departmentLabel || "Course"}: ${course}`);
    if (year) parts.push(`${labels.roleLabel || "Year Level"}: ${year}`);
    if (section) parts.push(`${labels.groupLabel || "Section"}: ${section}`);
    if (status) parts.push(`Status: ${status}`);
    return parts.length ? parts.join(" | ") : "All records";
  };

  const buildRows = (rows) =>
    rows.map((r, i) => [
      i + 1,
      formatDate(r.attendanceDate),
      r.participantIdentifier || r.studentNumber || "-",
      [r.firstName, r.lastName].filter(Boolean).join(" ") || "-",
      r.department || r.course || "-",
      r.year || "-",
      r.section || r.group_name || "-",
      formatTime(r.timeIn),
      r.status || "-",
    ]);

  const handleExportPDF = () => {
    if (filteredRecords.length === 0) {
      showToast("error", "No records available to export.");
      return;
    }

    try {
      const doc = new jsPDF("landscape", "mm", "a4");

      if (schoolSettings?.schoolLogo) {
        try {
          doc.addImage(schoolSettings.schoolLogo, "JPEG", 14, 10, 25, 25);
        } catch {
          // Skip logo if image loading fails
        }
      }

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(schoolSettings?.schoolName || "Organization Name", 45, 20);

      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text("Attendance Analytics Report", 45, 30);

      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
      doc.text(`Generated: ${dateStr}`, 45, 36);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Filters: ${getFiltersLabel()}`, 14, 46);

      const tableColumns = ["#", "Date", "Participant Number", "Participant Name", "Department", "Level", "Group", "Time In", "Status"];
      const tableRows = buildRows(filteredRecords);

      autoTable(doc, {
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
      doc.text(`Total Records: ${filteredRecords.length}`, 14, finalY + 10);

      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Generated by Attendance Management Platform", 14, finalY + 18);

      doc.save("Attendance_Analytics_Report.pdf");
      showToast("success", "PDF exported successfully.");
    } catch (err) {
      showToast("error", "Failed to export PDF.");
      console.error("PDF export error:", err);
    }
  };

  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      showToast("error", "No records available to export.");
      return;
    }

    try {
      const wb = XLSX.utils.book_new();
      const wsData = [
        [`${schoolSettings?.schoolName || "Organization"} — Attendance Analytics Report`],
        [`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}`],
        [`Filters: ${getFiltersLabel()}`],
        [],
        ["Date", "Participant Number", "Participant Name", "Department", "Level", "Group", "Time In", "Status"],
      ];

      filteredRecords.forEach((r) => {
        wsData.push([
          formatDate(r.attendanceDate),
          r.participantIdentifier || r.studentNumber || "-",
          [r.firstName, r.lastName].filter(Boolean).join(" ") || "-",
          r.department || r.course || "-",
          r.year || "-",
          r.section || r.group_name || "-",
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

      XLSX.utils.book_append_sheet(wb, ws, "Attendance Analytics");
      XLSX.writeFile(wb, "Attendance_Analytics_Report.xlsx");
      showToast("success", "Excel exported successfully.");
    } catch (err) {
      showToast("error", "Failed to export Excel.");
      console.error("Excel export error:", err);
    }
  };

  const handlePrint = () => {
    if (filteredRecords.length === 0) {
      showToast("error", "No records available to export.");
      return;
    }
    window.print();
  };

  const handleReset = () => {
    setStartDate("");
    setEndDate("");
    setCourse("");
    setYear("");
    setSection("");
    setStatus("");
    setGeneratedAt(null);
  };

  const isFiltered = Boolean(startDate || endDate || course || year || section || status);

  return (
    <div className="an-card">
      {toastVisible ? (
        <div className={`an-toast an-toast--${toast.kind}`} role="status">
          {toast.message}
        </div>
      ) : null}

      <div className="an-card-header">
        <div>
          <h3 className="an-card-title">Report Generator</h3>
          <p className="an-card-subtitle">Filter attendance records and export professional reports</p>
        </div>
      </div>

      <div className="an-report-filters">
        <div className="an-field">
          <label className="an-field-label">From Date</label>
          <input type="date" className="an-field-control" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="an-field">
          <label className="an-field-label">To Date</label>
          <input type="date" className="an-field-control" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="an-field">
          <label className="an-field-label">{labels.departmentLabel || "Course / Strand"}</label>
          <select className="an-field-control" value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">All</option>
            {courseOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div className="an-field">
          <label className="an-field-label">{labels.roleLabel || "Year Level"}</label>
          <select className="an-field-control" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All</option>
            {yearOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div className="an-field">
          <label className="an-field-label">{labels.groupLabel || "Section"}</label>
          <select className="an-field-control" value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">All</option>
            {sectionOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div className="an-field">
          <label className="an-field-label">Status</label>
          <select className="an-field-control" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="an-report-actions">
        <button type="button" className="an-btn an-btn--primary" onClick={handleGenerate}>
          <FiSearch /> Generate Report
        </button>
        <button type="button" className="an-btn an-btn--outline" onClick={handleReset}>
          <FiRefreshCw /> Reset
        </button>
      </div>

      <div className="an-report-result">
        <div className="an-report-meta">
          <span className="an-report-count">
            {filteredRecords.length} record{filteredRecords.length === 1 ? "" : "s"}
          </span>
          <span className="an-report-filters">Filters: {getFiltersLabel()}</span>
          {generatedAt ? (
            <span className="an-report-generated">
              Generated: {generatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          ) : null}
        </div>

        <div className="an-report-export-buttons">
          <button type="button" className="an-export-btn an-export-btn--pdf" onClick={handleExportPDF} disabled={filteredRecords.length === 0}>
            <FiFileText /> Export PDF
          </button>
          <button type="button" className="an-export-btn an-export-btn--excel" onClick={handleExportExcel} disabled={filteredRecords.length === 0}>
            <FiDownload /> Export Excel
          </button>
          <button type="button" className="an-export-btn an-export-btn--print" onClick={handlePrint} disabled={filteredRecords.length === 0}>
            <FiPrinter /> Print Report
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportGenerator;

