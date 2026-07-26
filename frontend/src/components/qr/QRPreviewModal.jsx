import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import StudentPhoto from "../students/StudentPhoto";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function formatDate(val) {
  if (!val) return "-";
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val).slice(0, 10);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function QRPreviewModal({ isOpen, student, onClose, onDownloadPng, onDownloadPdf, onPrint }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    if (!isOpen || !student?.qrCode) {
      setDataUrl("");
      return;
    }
    QRCode.toDataURL(String(student.qrCode), {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 512,
    })
      .then((url) => setDataUrl(url))
      .catch(() => setDataUrl(""));
  }, [isOpen, student?.qrCode]);

  const fullName = useMemo(() => {
    if (!student) return "";
    return [student.lastName, student.firstName, student.middleName]
      .filter(Boolean)
      .join(" ") || student.studentNumber;
  }, [student]);

  if (!isOpen || !student) return null;

  return (
    <div
      className="ui-modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="ui-modal-card" style={{ maxWidth: 600 }} onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>QR Code Preview</h3>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
              Student QR Code Details
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 24,
              cursor: "pointer",
              color: "#94a3b8",
              padding: "0 4px",
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
            {/* QR Code */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  background: "#fff",
                  border: "2px solid #e2e8f0",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 220,
                  height: 220,
                }}
              >
                {dataUrl ? (
                  <img
                    src={dataUrl}
                    alt={`QR Code for ${fullName}`}
                    style={{ maxWidth: "100%", maxHeight: "100%" }}
                  />
                ) : (
                  <div style={{ color: "#94a3b8", fontSize: 13 }}>Loading QR...</div>
                )}
              </div>
              {student.qrUuid && (
                <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", wordBreak: "break-all", maxWidth: 220 }}>
                  UUID: {student.qrUuid}
                </div>
              )}
            </div>

            {/* Student Info */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <StudentPhoto
                  photoPath={student.photo}
                  studentName={fullName}
                  size={56}
                  alt="Student photo"
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{fullName}</div>
                  <div style={{ color: "#475569", fontSize: 13 }}>{student.studentNumber}</div>
                </div>
              </div>

              <div className="qr-preview-details">
                <div className="qr-preview-detail-row">
                  <span className="qr-preview-detail-label">Course</span>
                  <span className="qr-preview-detail-value">{student.course || "-"}</span>
                </div>
                <div className="qr-preview-detail-row">
                  <span className="qr-preview-detail-label">Year Level</span>
                  <span className="qr-preview-detail-value">{student.year || "-"}</span>
                </div>
                <div className="qr-preview-detail-row">
                  <span className="qr-preview-detail-label">Section</span>
                  <span className="qr-preview-detail-value">{student.section || "-"}</span>
                </div>
                <div className="qr-preview-detail-row">
                  <span className="qr-preview-detail-label">QR Status</span>
                  <span className="qr-preview-detail-value">
                    {student.qrStatus === "generated" ? (
                      <span className="qr-badge qr-badge--generated">Generated</span>
                    ) : student.qrStatus === "printed" ? (
                      <span className="qr-badge qr-badge--printed">Printed</span>
                    ) : (
                      <span className="qr-badge qr-badge--missing">Missing</span>
                    )}
                  </span>
                </div>
                {student.qrGeneratedAt && (
                  <div className="qr-preview-detail-row">
                    <span className="qr-preview-detail-label">Date Generated</span>
                    <span className="qr-preview-detail-value">{formatDate(student.qrGeneratedAt)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={() => onDownloadPng(student)}
            disabled={!dataUrl}
          >
            🖼️ Download PNG
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={() => onDownloadPdf(student)}
            disabled={!dataUrl}
          >
            📄 Download PDF
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-secondary"
            onClick={() => onPrint(student)}
            disabled={!dataUrl}
          >
            🖨️ Print
          </button>
        </div>
      </div>
    </div>
  );
}

export default QRPreviewModal;

