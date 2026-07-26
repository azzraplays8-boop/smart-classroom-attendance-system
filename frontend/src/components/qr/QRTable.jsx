import { useCallback, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import StudentPhoto from "../students/StudentPhoto";
import ConfirmDialog from "../students/ConfirmDialog";

function QRPreviewThumb({ qrCode, size = 40 }) {
  const [dataUrl, setDataUrl] = useState("");
  const mountedRef = useRef(true);

  useMemo(() => {
    if (!qrCode) {
      setDataUrl("");
      return;
    }
    QRCode.toDataURL(String(qrCode), {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 128,
    })
      .then((url) => {
        if (mountedRef.current) setDataUrl(url);
      })
      .catch(() => {
        if (mountedRef.current) setDataUrl("");
      });
    return () => {
      mountedRef.current = false;
    };
  }, [qrCode]);

  if (!dataUrl) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: "#f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: "#94a3b8",
          border: "1px solid #e2e8f0",
        }}
      >
        No QR
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR Code"
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        objectFit: "contain",
        border: "1px solid #e2e8f0",
      }}
    />
  );
}

function QRTable({
  students,
  pagination,
  loading,
  selectedIds,
  onSelect,
  onSelectAll,
  onViewQr,
  onDownloadPng,
  onDownloadPdf,
  onPrint,
  onRegenerate,
  onDelete,
  onPageChange,
}) {
  const allSelected = useMemo(() => {
    if (!students || students.length === 0) return false;
    return students.every((s) => selectedIds.includes(s.id));
  }, [students, selectedIds]);

  const [pendingDelete, setPendingDelete] = useState(null);

  const handleDelete = useCallback(
    (student) => {
      setPendingDelete(student);
    },
    []
  );

  const confirmDelete = useCallback(() => {
    if (pendingDelete) {
      onDelete(pendingDelete);
      setPendingDelete(null);
    }
  }, [pendingDelete, onDelete]);

  const formatDate = (val) => {
    if (!val) return "-";
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val).slice(0, 10);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status) => {
    if (status === "generated")
      return <span className="qr-badge qr-badge--generated">Generated</span>;
    if (status === "printed")
      return <span className="qr-badge qr-badge--printed">Printed</span>;
    return <span className="qr-badge qr-badge--missing">Missing</span>;
  };

  const getFullName = (s) =>
    [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" ") || "-";

  return (
    <>
      <div className="ui-table-wrap">
        <div style={{ overflowX: "auto" }}>
          <table className="qr-table ui-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allSelected && students.length > 0}
                    onChange={() => onSelectAll(!allSelected)}
                    aria-label="Select all"
                  />
                </th>
                <th>QR Preview</th>
                <th>Student Number</th>
                <th>Student Name</th>
                <th>Course</th>
                <th>Year</th>
                <th>Section</th>
                <th>QR Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#64748b" }}>
                    Loading QR records...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#64748b" }}>
                    No students found matching the current filters.
                  </td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={() => onSelect(s.id)}
                        aria-label={`Select ${s.studentNumber}`}
                      />
                    </td>
                    <td>
                      <QRPreviewThumb qrCode={s.qrCode} size={40} />
                    </td>
                    <td>{s.studentNumber}</td>
                    <td>{getFullName(s)}</td>
                    <td>{s.course || "-"}</td>
                    <td>{s.year || "-"}</td>
                    <td>{s.section || "-"}</td>
                    <td>{getStatusBadge(s.qrStatus)}</td>
                    <td>
                      <div className="qr-actions-cell">
                        <button
                          type="button"
                          className="qr-action-btn"
                          onClick={() => onViewQr(s)}
                          title="View QR"
                        >
                          👁️
                        </button>
                        {s.qrStatus !== "missing" ? (
                          <>
                            <button
                              type="button"
                              className="qr-action-btn"
                              onClick={() => onDownloadPng(s)}
                              title="Download PNG"
                            >
                              🖼️
                            </button>
                            <button
                              type="button"
                              className="qr-action-btn"
                              onClick={() => onDownloadPdf(s)}
                              title="Download PDF"
                            >
                              📄
                            </button>
                            <button
                              type="button"
                              className="qr-action-btn"
                              onClick={() => onPrint(s)}
                              title="Print QR"
                            >
                              🖨️
                            </button>
                            <button
                              type="button"
                              className="qr-action-btn"
                              onClick={() => onRegenerate(s)}
                              title="Regenerate QR"
                            >
                              🔄
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="qr-action-btn qr-action-btn--generate"
                            onClick={() => onRegenerate(s)}
                            title="Generate QR"
                          >
                            ✨
                          </button>
                        )}
                        <button
                          type="button"
                          className="qr-action-btn qr-action-btn--delete"
                          onClick={() => handleDelete(s)}
                          title="Delete QR"
                        >
                          🗑️
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

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="qr-pagination">
          <div className="qr-pagination-info">
            Showing {students.length} of {pagination.total} records
            {pagination.page > 1 && ` (Page ${pagination.page} of ${pagination.pages})`}
          </div>
          <div className="qr-pagination-buttons">
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              disabled={pagination.page >= pagination.pages}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title="Delete QR Code"
        message="Are you sure you want to delete this student's QR code? This will require regenerating a new QR code."
        primaryLabel="Delete QR"
        primaryVariant="danger"
        onPrimary={confirmDelete}
        onCancel={() => setPendingDelete(null)}
        details={
          pendingDelete
            ? `${pendingDelete.studentNumber} — ${getFullName(pendingDelete)}`
            : null
        }
      />
    </>
  );
}

export default QRTable;

