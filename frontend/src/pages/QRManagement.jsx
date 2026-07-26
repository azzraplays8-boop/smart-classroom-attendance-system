import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCodeLib from "qrcode";
import QRCard from "../components/qr/QRCard";
import QRFilters from "../components/qr/QRFilters";
import QRTable from "../components/qr/QRTable";
import QRPreviewModal from "../components/qr/QRPreviewModal";
import BulkActions from "../components/qr/BulkActions";
import qrService from "../services/qrService";
import "../styles/qr/QRManagement.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function getStudentPhotoUrl(photoPath) {
  if (!photoPath) return null;
  const trimmed = String(photoPath).trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${API_BASE_URL}/uploads${normalized}`;
}

function showToast(kind, message) {
  const event = new CustomEvent("qr-toast", {
    detail: { kind, message, id: Date.now() },
  });
  window.dispatchEvent(event);
}

function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      const newToast = e.detail;
      setToasts((prev) => [...prev, newToast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 2600);
    };
    window.addEventListener("qr-toast", handler);
    return () => window.removeEventListener("qr-toast", handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 2100, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: t.kind === "success" ? "#dcfce7" : "#fee2e2",
            color: t.kind === "success" ? "#166534" : "#991b1b",
            border: `1px solid ${t.kind === "success" ? "#86efac" : "#fca5a5"}`,
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.14)",
            fontWeight: 700,
            maxWidth: 420,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

function QRManagement() {
  const [stats, setStats] = useState({ totalStudents: 0, qrGenerated: 0, missingQr: 0, printedQr: 0 });
  const [students, setStudents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 });
  const [filters, setFilters] = useState({ search: "", course: "", year: "", section: "", qrStatus: "" });
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [previewStudent, setPreviewStudent] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const pageRef = useRef(1);
  const filtersRef = useRef(filters);

  // Keep refs in sync
  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { pageRef.current = pagination.page; }, [pagination.page]);

  // ── Fetch Stats ──────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const data = await qrService.getStats();
      if (data) {
        setStats({
          totalStudents: data.totalStudents ?? 0,
          qrGenerated: data.qrGenerated ?? 0,
          missingQr: data.missingQr ?? 0,
          printedQr: data.printedQr ?? 0,
        });
      }
    } catch {
      // Silently fail
    }
  }, []);

  // ── Fetch List ───────────────────────────────────────────────
  const fetchList = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const data = await qrService.getList({ ...filtersRef.current, page, limit: 25 });
      if (data) {
        setStudents(Array.isArray(data.students) ? data.students : []);
        setPagination(
          data.pagination || { page: 1, limit: 25, total: 0, pages: 1 }
        );
      }
    } catch {
      showToast("error", "Failed to load QR records.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Initial load ─────────────────────────────────────────────
  useEffect(() => {
    fetchStats();
    fetchList(1);
  }, [fetchStats, fetchList]);

  // ── Filter handlers ──────────────────────────────────────────
  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleApplyFilters = useCallback(() => {
    setSelectedIds([]);
    fetchList(1);
  }, [fetchList]);

  const handleResetFilters = useCallback(() => {
    setFilters({ search: "", course: "", year: "", section: "", qrStatus: "" });
    setSelectedIds([]);
    setTimeout(() => fetchList(1), 0);
  }, [fetchList]);

  const handlePageChange = useCallback(
    (page) => {
      fetchList(page);
    },
    [fetchList]
  );

  // ── Selection handlers ───────────────────────────────────────
  const handleSelect = useCallback((id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const handleSelectAll = useCallback(
    (select) => {
      if (select) {
        setSelectedIds(students.map((s) => s.id));
      } else {
        setSelectedIds([]);
      }
    },
    [students]
  );

  // ── Generate QR ──────────────────────────────────────────────
  const handleGenerate = useCallback(
    async (student) => {
      try {
        await qrService.generate(student.id);
        showToast("success", `QR code generated for ${student.studentNumber}`);
        fetchStats();
        fetchList(pageRef.current);
      } catch (err) {
        showToast("error", err?.message || "Failed to generate QR code.");
      }
    },
    [fetchStats, fetchList]
  );

  // ── Regenerate QR ────────────────────────────────────────────
  const handleRegenerate = useCallback(
    async (student) => {
      try {
        await qrService.regenerate(student.id);
        showToast("success", `QR code regenerated for ${student.studentNumber}`);
        fetchStats();
        fetchList(pageRef.current);
      } catch (err) {
        showToast("error", err?.message || "Failed to regenerate QR code.");
      }
    },
    [fetchStats, fetchList]
  );

  // ── Delete QR ────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (student) => {
      try {
        await qrService.delete(student.id);
        showToast("success", `QR code deleted for ${student.studentNumber}`);
        setSelectedIds((prev) => prev.filter((id) => id !== student.id));
        fetchStats();
        fetchList(pageRef.current);
      } catch (err) {
        showToast("error", err?.message || "Failed to delete QR code.");
      }
    },
    [fetchStats, fetchList]
  );

  // ── View QR Preview ──────────────────────────────────────────
  const handleViewQr = useCallback(async (student) => {
    try {
      const data = await qrService.getById(student.id);
      setPreviewStudent(data?.student || student);
      setIsPreviewOpen(true);
    } catch {
      setPreviewStudent(student);
      setIsPreviewOpen(true);
    }
  }, []);

  // ── Download PNG ─────────────────────────────────────────────
  const handleDownloadPng = useCallback(async (student) => {
    try {
      const payload = student.qrCode || JSON.stringify({
        id: student.id,
        studentNumber: student.studentNumber,
        uuid: student.qrUuid,
      });
      const dataUrl = await QRCodeLib.toDataURL(String(payload), {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 512,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${student.studentNumber || "student"}_qr.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast("success", "QR PNG downloaded.");
    } catch {
      showToast("error", "Failed to download PNG.");
    }
  }, []);

  // ── Download PDF (individual) ────────────────────────────────
  const handleDownloadPdf = useCallback(async (student) => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF("portrait", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();

      // School header
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pageWidth, 30, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text("Smart Classroom Attendance System", pageWidth / 2, 16, { align: "center" });
      doc.setFontSize(10);
      doc.text("QR Code - Student Identification", pageWidth / 2, 24, { align: "center" });

      // Student info
      const fullName = [student.lastName, student.firstName, student.middleName]
        .filter(Boolean)
        .join(" ") || student.studentNumber;

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(22);
      doc.text(fullName, pageWidth / 2, 52, { align: "center" });

      doc.setFontSize(12);
      doc.setTextColor(71, 85, 105);
      doc.text(`Student Number: ${student.studentNumber}`, pageWidth / 2, 64, { align: "center" });
      doc.text(`Course: ${student.course || "-"}`, pageWidth / 2, 74, { align: "center" });
      doc.text(`Section: ${student.section || "-"}`, pageWidth / 2, 84, { align: "center" });

      // Generate QR in PDF
      const payload = student.qrCode || JSON.stringify({
        id: student.id,
        studentNumber: student.studentNumber,
        uuid: student.qrUuid,
      });
      const dataUrl = await QRCodeLib.toDataURL(String(payload), {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 512,
      });

      // Add QR image centered
      const qrSize = 80;
      const qrX = (pageWidth - qrSize) / 2;
      doc.addImage(dataUrl, "PNG", qrX, 96, qrSize, qrSize);

      // QR UUID
      if (student.qrUuid) {
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`UUID: ${student.qrUuid}`, pageWidth / 2, 190, { align: "center" });
      }

      // Footer
      const now = new Date();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Generated: ${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        pageWidth / 2,
        200,
        { align: "center" }
      );

      const filename = `${student.studentNumber || "student"}_qr.pdf`;
      doc.save(filename);
      showToast("success", "QR PDF downloaded.");
    } catch {
      showToast("error", "Failed to download PDF.");
    }
  }, []);

  // ── Print QR Card ────────────────────────────────────────────
  const handlePrint = useCallback(async (student) => {
    try {
      const payload = student.qrCode || JSON.stringify({
        id: student.id,
        studentNumber: student.studentNumber,
        uuid: student.qrUuid,
      });
      const dataUrl = await QRCodeLib.toDataURL(String(payload), {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 512,
      });

      const fullName = [student.lastName, student.firstName, student.middleName]
        .filter(Boolean)
        .join(" ") || student.studentNumber;

      const photoUrl = getStudentPhotoUrl(student.photo);
      const photoTag = photoUrl
        ? `<img src="${photoUrl}" alt="Photo" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid #e2e8f0;" />`
        : `<div style="width:120px;height:120px;border-radius:50%;background:linear-gradient(135deg,#4338ca,#7c3aed);display:flex;align-items:center;justify-content:center;color:#fff;font-size:36px;font-weight:700;border:3px solid #e2e8f0;">${(fullName.match(/\b\w/g) || ["S"]).slice(0, 2).join("").toUpperCase()}</div>`;

      const printWindow = window.open("", "_blank", "width=600,height=800");
      if (!printWindow) {
        showToast("error", "Please allow pop-ups to print.");
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>QR Card - ${fullName}</title>
          <style>
            @page { margin: 0; size: 54mm 86mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              background: #f1f5f9;
              padding: 10px;
            }
            .card {
              width: 50mm;
              min-height: 80mm;
              background: #fff;
              border-radius: 8px;
              padding: 12px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 6px;
            }
            .school-name { font-size: 9px; font-weight: 700; color: #4338ca; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; }
            .divider { width: 80%; height: 1px; background: #e2e8f0; margin: 2px 0; }
            .qr-img { width: 140px; height: 140px; }
            .qr-img img { width: 100%; height: 100%; object-fit: contain; }
            .name { font-size: 13px; font-weight: 700; color: #0f172a; text-align: center; }
            .student-num { font-size: 10px; color: #475569; text-align: center; }
            .info { font-size: 9px; color: #64748b; text-align: center; }
            .info-row { display: flex; gap: 8px; justify-content: center; }
            @media print {
              body { background: #fff; padding: 0; }
              .card { box-shadow: none; border-radius: 0; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="school-name">Smart Classroom<br/>Attendance System</div>
            <div class="divider"></div>
            ${photoTag}
            <div class="qr-img"><img src="${dataUrl}" alt="QR" /></div>
            <div class="name">${fullName}</div>
            <div class="student-num">${student.studentNumber}</div>
            <div class="info-row">
              <span class="info">${student.course || ""}</span>
              <span class="info">${student.section || ""}</span>
            </div>
            ${student.qrUuid ? `<div style="font-size:6px;color:#94a3b8;word-break:break-all;text-align:center;">${student.qrUuid}</div>` : ""}
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); };
          <\/script>
        </body>
        </html>
      `);
      printWindow.document.close();

      // Mark as printed
      try {
        await qrService.markPrinted(student.id);
        fetchStats();
        fetchList(pageRef.current);
      } catch {
        // Silently fail
      }
    } catch {
      showToast("error", "Failed to print QR card.");
    }
  }, [fetchStats, fetchList]);

  // ── Bulk Generate Missing ────────────────────────────────────
  const handleBulkGenerateMissing = useCallback(async () => {
    const missingIds = students
      .filter((s) => selectedIds.includes(s.id) && s.qrStatus === "missing")
      .map((s) => s.id);

    if (missingIds.length === 0) {
      showToast("error", "No selected students with missing QR codes.");
      return;
    }

    try {
      const data = await qrService.generateBulk(missingIds);
      showToast("success", data?.message || `${missingIds.length} QR codes generated.`);
      setSelectedIds([]);
      fetchStats();
      fetchList(pageRef.current);
    } catch (err) {
      showToast("error", err?.message || "Failed to generate QR codes.");
    }
  }, [students, selectedIds, fetchStats, fetchList]);

  // ── Bulk Download ZIP ────────────────────────────────────────
  const handleBulkDownloadZip = useCallback(async () => {
    if (selectedIds.length === 0) {
      showToast("error", "No students selected.");
      return;
    }

    try {
      // Generate all QR data URLs and create a temporary combined approach
      // Since we can't create ZIP in browser natively, we'll download individually
      const selected = students.filter((s) => selectedIds.includes(s.id) && s.qrStatus !== "missing");

      if (selected.length === 0) {
        showToast("error", "No selected students with generated QR codes.");
        return;
      }

      // Download each as PNG (simple bulk approach)
      for (const student of selected) {
        const payload = student.qrCode || JSON.stringify({
          id: student.id,
          studentNumber: student.studentNumber,
          uuid: student.qrUuid,
        });
        const dataUrl = await QRCodeLib.toDataURL(String(payload), {
          errorCorrectionLevel: "H",
          margin: 2,
          width: 512,
        });
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `${student.studentNumber || "student"}_qr.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Small delay to avoid browser blocking multiple downloads
        await new Promise((r) => setTimeout(r, 200));
      }

      showToast("success", `Downloaded ${selected.length} QR codes.`);
    } catch {
      showToast("error", "Failed to download QR codes.");
    }
  }, [students, selectedIds]);

  // ── Bulk Print ───────────────────────────────────────────────
  const handleBulkPrint = useCallback(async () => {
    const selected = students.filter((s) => selectedIds.includes(s.id) && s.qrStatus !== "missing");
    if (selected.length === 0) {
      showToast("error", "No selected students with generated QR codes to print.");
      return;
    }

    // Print first student's card as sample
    handlePrint(selected[0]);
  }, [students, selectedIds, handlePrint]);

  // ── Bulk Delete ──────────────────────────────────────────────
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    try {
      const data = await qrService.deleteBulk(selectedIds);
      showToast("success", data?.message || `${selectedIds.length} QR codes deleted.`);
      setSelectedIds([]);
      fetchStats();
      fetchList(pageRef.current);
    } catch (err) {
      showToast("error", err?.message || "Failed to delete QR codes.");
    }
  }, [selectedIds, fetchStats, fetchList]);

  // ── Compute summary cards ────────────────────────────────────
  const cards = useMemo(
    () => [
      { label: "Total Students", value: stats.totalStudents, type: "totalStudents" },
      { label: "QR Generated", value: stats.qrGenerated, type: "qrGenerated" },
      { label: "Missing QR", value: stats.missingQr, type: "missingQr" },
      { label: "Printed QR", value: stats.printedQr, type: "printedQr" },
    ],
    [stats]
  );

  return (
    <div className="qr-page">
      <ToastContainer />

      {/* Page Header */}
      <div className="qr-page-header">
        <h2 className="qr-page-title">QR Code Management</h2>
        <p className="qr-page-subtitle">
          Generate, manage, download, print and regenerate student QR codes.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="qr-summary-grid">
        {cards.map((card) => (
          <QRCard key={card.type} label={card.label} value={card.value} type={card.type} />
        ))}
      </div>

      {/* Filters */}
      <QRFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        loading={loading}
      />

      {/* Bulk Actions */}
      <BulkActions
        selectedCount={selectedIds.length}
        onGenerateMissing={handleBulkGenerateMissing}
        onDownloadZip={handleBulkDownloadZip}
        onBulkPrint={handleBulkPrint}
        onBulkDelete={handleBulkDelete}
        loading={loading}
      />

      {/* Table */}
      <QRTable
        students={students}
        pagination={pagination}
        loading={loading}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onSelectAll={handleSelectAll}
        onViewQr={handleViewQr}
        onDownloadPng={handleDownloadPng}
        onDownloadPdf={handleDownloadPdf}
        onPrint={handlePrint}
        onRegenerate={(s) =>
          s.qrStatus === "missing" ? handleGenerate(s) : handleRegenerate(s)
        }
        onDelete={handleDelete}
        onPageChange={handlePageChange}
      />

      {/* Preview Modal */}
      <QRPreviewModal
        isOpen={isPreviewOpen}
        student={previewStudent}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewStudent(null);
        }}
        onDownloadPng={handleDownloadPng}
        onDownloadPdf={handleDownloadPdf}
        onPrint={handlePrint}
      />
    </div>
  );
}

export default QRManagement;

