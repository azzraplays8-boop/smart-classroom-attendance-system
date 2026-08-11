  import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCodeLib from "qrcode";
import jsPDF from "jspdf";
import QRCard from "../components/qr/QRCard";
import QRFilters from "../components/qr/QRFilters";
import QRTable from "../components/qr/QRTable";
import QRPreviewModal from "../components/qr/QRPreviewModal";
import BulkActions from "../components/qr/BulkActions";
import qrService from "../services/qrService";
import { API_BASE_URL } from "../config/api";
import "../styles/qr/QRManagement.css";

function getParticipantPhotoUrl(photoPath) {
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
  const [stats, setStats] = useState({ totalParticipants: 0, qrGenerated: 0, missingQr: 0, printedQr: 0 });
  const [participants, setParticipants] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 });
  const [filters, setFilters] = useState({ search: "", department: "", level: "", group: "", qrStatus: "" });
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [previewParticipant, setPreviewParticipant] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const pageRef = useRef(1);
  const filtersRef = useRef(filters);

  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { pageRef.current = pagination.page; }, [pagination.page]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await qrService.getStats();
      if (data) {
        setStats({
          totalParticipants: data.totalParticipants ?? 0,
          qrGenerated: data.qrGenerated ?? 0,
          missingQr: data.missingQr ?? 0,
          printedQr: data.printedQr ?? 0,
        });
      }
    } catch {}
  }, []);

  const fetchList = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const data = await qrService.getList({ ...filtersRef.current, page, limit: 25 });
      if (data) {
        setParticipants(Array.isArray(data.participants) ? data.participants : []);
        setPagination(data.pagination || { page: 1, limit: 25, total: 0, pages: 1 });
      }
    } catch {
      showToast("error", "Failed to load QR records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchList(1);
  }, [fetchStats, fetchList]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleApplyFilters = useCallback(() => {
    setSelectedIds([]);
    fetchList(1);
  }, [fetchList]);

  const handleResetFilters = useCallback(() => {
    setFilters({ search: "", department: "", level: "", group: "", qrStatus: "" });
    setSelectedIds([]);
    setTimeout(() => fetchList(1), 0);
  }, [fetchList]);

  const handlePageChange = useCallback((page) => { fetchList(page); }, [fetchList]);

  const handleSelect = useCallback((id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }, []);

  const handleSelectAll = useCallback((select) => {
    if (select) {
      setSelectedIds(participants.map((p) => p.id));
    } else {
      setSelectedIds([]);
    }
  }, [participants]);

  const handleGenerate = useCallback(async (participant) => {
    try {
      await qrService.generate(participant.id);
      showToast("success", `QR code generated for ${participant.participantIdentifier ?? participant.studentNumber}`);
      fetchStats();
      fetchList(pageRef.current);
    } catch (err) {
      showToast("error", err?.message || "Failed to generate QR code.");
    }
  }, [fetchStats, fetchList]);

  const handleRegenerate = useCallback(async (participant) => {
    try {
      await qrService.regenerate(participant.id);
      showToast("success", `QR code regenerated for ${participant.participantIdentifier ?? participant.studentNumber}`);
      fetchStats();
      fetchList(pageRef.current);
    } catch (err) {
      showToast("error", err?.message || "Failed to regenerate QR code.");
    }
  }, [fetchStats, fetchList]);

  const handleDelete = useCallback(async (participant) => {
    try {
      await qrService.delete(participant.id);
      showToast("success", `QR code deleted for ${participant.participantIdentifier ?? participant.studentNumber}`);
      setSelectedIds((prev) => prev.filter((id) => id !== participant.id));
      fetchStats();
      fetchList(pageRef.current);
    } catch (err) {
      showToast("error", err?.message || "Failed to delete QR code.");
    }
  }, [fetchStats, fetchList]);

  const handleViewQr = useCallback(async (participant) => {
    try {
      const data = await qrService.getById(participant.id);
      setPreviewParticipant(data?.participant || participant);
      setIsPreviewOpen(true);
    } catch {
      setPreviewParticipant(participant);
      setIsPreviewOpen(true);
    }
  }, []);

  const handleDownloadPng = useCallback(async (participant) => {
    try {
      const payload = participant.qrCode || JSON.stringify({
        id: participant.id,
        participantIdentifier: participant.participantIdentifier ?? participant.studentNumber,
        uuid: participant.qrUuid,
      });
      const dataUrl = await QRCodeLib.toDataURL(String(payload), {
        errorCorrectionLevel: "H", margin: 2, width: 512,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${participant.participantIdentifier ?? participant.studentNumber ?? "participant"}_qr.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast("success", "QR PNG downloaded.");
    } catch {
      showToast("error", "Failed to download PNG.");
    }
  }, []);

  const handleDownloadPdf = useCallback(async (participant) => {
    try {
      const doc = new jsPDF("portrait", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pageWidth, 30, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text("Attendance Management System", pageWidth / 2, 16, { align: "center" });
      doc.setFontSize(10);
      doc.text("QR Code - Participant Identification", pageWidth / 2, 24, { align: "center" });

      const participantId = participant.participantIdentifier ?? participant.studentNumber;
      const nameParts = [participant.lastName, participant.firstName, participant.middleName].filter(Boolean).join(" ");
      // Use name if available, otherwise fall back to participantId
      const fullName = nameParts || participantId;

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(22);
      doc.text(fullName, pageWidth / 2, 52, { align: "center" });
      doc.setFontSize(12);
      doc.setTextColor(71, 85, 105);
      doc.text(`Participant ID: ${participantId}`, pageWidth / 2, 64, { align: "center" });
      doc.text(`Department: ${participant.course || participant.department || "-"}`, pageWidth / 2, 74, { align: "center" });
      doc.text(`Group: ${participant.section || participant.groupName || "-"}`, pageWidth / 2, 84, { align: "center" });

      const payload = participant.qrCode || JSON.stringify({
        id: participant.id,
        participantIdentifier: participantId,
        uuid: participant.qrUuid,
      });
      const dataUrl = await QRCodeLib.toDataURL(String(payload), {
        errorCorrectionLevel: "H", margin: 2, width: 512,
      });

      const qrSize = 80;
      const qrX = (pageWidth - qrSize) / 2;
      doc.addImage(dataUrl, "PNG", qrX, 96, qrSize, qrSize);

      if (participant.qrUuid) {
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`UUID: ${participant.qrUuid}`, pageWidth / 2, 190, { align: "center" });
      }

      const now = new Date();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated: ${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`, pageWidth / 2, 200, { align: "center" });

      const filename = `${participantId}_qr.pdf`;
      doc.save(filename);
      showToast("success", "QR PDF downloaded.");
    } catch {
      showToast("error", "Failed to download PDF.");
    }
  }, []);

  const handlePrint = useCallback(async (participant) => {
    try {
      const participantId = participant.participantIdentifier ?? participant.studentNumber;
      const payload = participant.qrCode || JSON.stringify({
        id: participant.id,
        participantIdentifier: participantId,
        uuid: participant.qrUuid,
      });
      const dataUrl = await QRCodeLib.toDataURL(String(payload), {
        errorCorrectionLevel: "H", margin: 2, width: 512,
      });

      const fullName = [participant.lastName, participant.firstName, participant.middleName]
        .filter(Boolean).join(" ") || participantId;

      const photoUrl = getParticipantPhotoUrl(participant.photo);
      const photoTag = photoUrl
        ? `<img src="${photoUrl}" alt="Photo" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid #e2e8f0;" />`
        : `<div style="width:120px;height:120px;border-radius:50%;background:linear-gradient(135deg,#4338ca,#7c3aed);display:flex;align-items:center;justify-content:center;color:#fff;font-size:36px;font-weight:700;border:3px solid #e2e8f0;">${(fullName.match(/\b\w/g) || ["P"]).slice(0, 2).join("").toUpperCase()}</div>`;

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
            body { font-family: 'Segoe UI', Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f1f5f9; padding: 10px; }
            .card { width: 50mm; min-height: 80mm; background: #fff; border-radius: 8px; padding: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); display: flex; flex-direction: column; align-items: center; gap: 6px; }
            .school-name { font-size: 9px; font-weight: 700; color: #4338ca; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; }
            .divider { width: 80%; height: 1px; background: #e2e8f0; margin: 2px 0; }
            .qr-img { width: 140px; height: 140px; }
            .qr-img img { width: 100%; height: 100%; object-fit: contain; }
            .name { font-size: 13px; font-weight: 700; color: #0f172a; text-align: center; }
            .participant-num { font-size: 10px; color: #475569; text-align: center; }
            .info { font-size: 9px; color: #64748b; text-align: center; }
            .info-row { display: flex; gap: 8px; justify-content: center; }
            @media print { body { background: #fff; padding: 0; } .card { box-shadow: none; border-radius: 0; } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="school-name">Attendance<br/>Management System</div>
            <div class="divider"></div>
            ${photoTag}
            <div class="qr-img"><img src="${dataUrl}" alt="QR" /></div>
            <div class="name">${fullName}</div>
            <div class="participant-num">${participantId}</div>
            <div class="info-row">
              <span class="info">${participant.course || participant.department || ""}</span>
              <span class="info">${participant.section || participant.groupName || ""}</span>
            </div>
            ${participant.qrUuid ? `<div style="font-size:6px;color:#94a3b8;word-break:break-all;text-align:center;">${participant.qrUuid}</div>` : ""}
          </div>
          <script>window.onload = function() { window.print(); window.close(); };<\/script>
        </body>
        </html>
      `);
      printWindow.document.close();

      try {
        await qrService.markPrinted(participant.id);
        fetchStats();
        fetchList(pageRef.current);
      } catch {}
    } catch {
      showToast("error", "Failed to print QR card.");
    }
  }, [fetchStats, fetchList]);

  const handleBulkGenerateMissing = useCallback(async () => {
    const missingIds = participants
      .filter((p) => selectedIds.includes(p.id) && p.qrStatus === "missing")
      .map((p) => p.id);

    if (missingIds.length === 0) {
      showToast("error", "No selected participants with missing QR codes.");
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
  }, [participants, selectedIds, fetchStats, fetchList]);

  const handleBulkDownloadZip = useCallback(async () => {
    if (selectedIds.length === 0) {
      showToast("error", "No participants selected.");
      return;
    }

    const selected = participants.filter((p) => selectedIds.includes(p.id) && p.qrStatus !== "missing");
    if (selected.length === 0) {
      showToast("error", "No selected participants with generated QR codes.");
      return;
    }

    for (const participant of selected) {
      const participantId = participant.participantIdentifier ?? participant.studentNumber;
      const payload = participant.qrCode || JSON.stringify({
        id: participant.id,
        participantIdentifier: participantId,
        uuid: participant.qrUuid,
      });
      const dataUrl = await QRCodeLib.toDataURL(String(payload), {
        errorCorrectionLevel: "H", margin: 2, width: 512,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${participantId}_qr.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      await new Promise((r) => setTimeout(r, 200));
    }

    showToast("success", `Downloaded ${selected.length} QR codes.`);
  }, [participants, selectedIds]);

  const handleBulkPrint = useCallback(async () => {
    const selected = participants.filter((p) => selectedIds.includes(p.id) && p.qrStatus !== "missing");
    if (selected.length === 0) {
      showToast("error", "No selected participants with generated QR codes to print.");
      return;
    }
    handlePrint(selected[0]);
  }, [participants, selectedIds, handlePrint]);

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

  const cards = useMemo(
    () => [
      { label: "Total Participants", value: stats.totalParticipants, type: "totalParticipants" },
      { label: "QR Generated", value: stats.qrGenerated, type: "qrGenerated" },
      { label: "Missing QR", value: stats.missingQr, type: "missingQr" },
      { label: "Printed QR", value: stats.printedQr, type: "printedQr" },
    ],
    [stats]
  );

  return (
    <div className="qr-page">
      <ToastContainer />

      <div className="qr-page-header">
        <h2 className="qr-page-title">QR Code Management</h2>
        <p className="qr-page-subtitle">
          Generate, manage, download, print and regenerate participant QR codes.
        </p>
      </div>

      <div className="qr-summary-grid">
        {cards.map((card) => (
          <QRCard key={card.type} label={card.label} value={card.value} type={card.type} />
        ))}
      </div>

      <QRFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        loading={loading}
      />

      <BulkActions
        selectedCount={selectedIds.length}
        onGenerateMissing={handleBulkGenerateMissing}
        onDownloadZip={handleBulkDownloadZip}
        onBulkPrint={handleBulkPrint}
        onBulkDelete={handleBulkDelete}
        loading={loading}
      />

      <QRTable
        participants={participants}
        pagination={pagination}
        loading={loading}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onSelectAll={handleSelectAll}
        onViewQr={handleViewQr}
        onDownloadPng={handleDownloadPng}
        onDownloadPdf={handleDownloadPdf}
        onPrint={handlePrint}
        onRegenerate={(p) =>
          p.qrStatus === "missing" ? handleGenerate(p) : handleRegenerate(p)
        }
        onDelete={handleDelete}
        onPageChange={handlePageChange}
      />

      <QRPreviewModal
        isOpen={isPreviewOpen}
        participant={previewParticipant}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewParticipant(null);
        }}
        onDownloadPng={handleDownloadPng}
        onDownloadPdf={handleDownloadPdf}
        onPrint={handlePrint}
      />
    </div>
  );
}

export default QRManagement;
