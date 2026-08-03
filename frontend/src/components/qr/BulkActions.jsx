function BulkActions({
  selectedCount,
  onGenerateMissing,
  onDownloadZip,
  onBulkPrint,
  onBulkDelete,
  loading,
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="qr-bulk-actions">
      <div className="qr-bulk-actions-label">
        <strong>{selectedCount}</strong> participant{selectedCount !== 1 ? "s" : ""} selected
      </div>
      <div className="qr-bulk-actions-buttons">
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          onClick={onGenerateMissing}
          disabled={loading}
          title="Generate QR for selected participants with missing QR"
        >
          📱 Generate Missing
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          onClick={onDownloadZip}
          disabled={loading}
          title="Download selected QR codes as ZIP"
        >
          📦 Download ZIP
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-secondary"
          onClick={onBulkPrint}
          disabled={loading}
          title="Print selected QR cards"
        >
          🖨️ Bulk Print
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-danger"
          onClick={onBulkDelete}
          disabled={loading}
          title="Delete selected QR codes"
        >
          🗑️ Bulk Delete
        </button>
      </div>
    </div>
  );
}

export default BulkActions;

