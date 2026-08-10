import { useNavigate } from "react-router-dom";
import { exportErrorReport } from "../../../services/importService";

/**
 * ImportSummary
 * Final result view: success counts + "Download Error Report" + recent imports.
 */
export default function ImportSummary({
  summary,
  errors,
  onClose,
  fileName,
  recentImports = [],
}) {
  const navigate = useNavigate();
  const s = summary || {};

  const statItems = [
    { label: "Successfully Imported", value: s.imported ?? 0, color: "#16a34a" },
    { label: "Duplicates", value: s.duplicates ?? 0, color: "#f59e0b" },
    { label: "Invalid Records", value: s.invalid ?? 0, color: "#ef4444" },
    { label: "Skipped", value: s.skipped ?? 0, color: "#64748b" },
  ];

  const handleDownload = () => {
    const base = (fileName || "import").replace(/\.[^.]+$/, "");
    exportErrorReport(errors || [], `${base}-error-report.xlsx`);
  };

  return (
    <div className="import-summary">
      <div className="import-summary-hero">
        <div className="import-summary-check">✓</div>
        <div className="import-summary-title">Import Completed</div>
        <div className="import-summary-file">{fileName}</div>
      </div>

      <div className="import-summary-grid">
        {statItems.map((it) => (
          <div className="import-summary-stat" key={it.label}>
            <div className="import-summary-stat-value" style={{ color: it.color }}>
              {it.value}
            </div>
            <div className="import-summary-stat-label">{it.label}</div>
          </div>
        ))}
      </div>

      {(errors?.length || 0) > 0 ? (
        <div className="import-summary-errors">
          <div className="import-summary-errors-title">
            {errors.length} row(s) were not imported. Review the error report.
          </div>
          <button
            type="button"
            className="import-btn import-btn-outline"
            onClick={handleDownload}
          >
            ⬇ Download Error Report
          </button>
        </div>
      ) : (
        <div className="import-summary-clean">
          All rows were imported successfully. No errors to report.
        </div>
      )}

      {recentImports.length > 0 ? (
        <div className="import-recent">
          <div className="import-recent-title">Recent Imports</div>
          <div className="import-recent-list">
            {recentImports.slice(0, 5).map((imp) => (
              <div className="import-recent-item" key={imp.id}>
                <div className="import-recent-name">{imp.filename}</div>
                <div className="import-recent-meta">
                  {imp.imported ?? 0} imported • {imp.duplicates ?? 0} dupes •{" "}
                  {imp.invalid ?? 0} invalid
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="import-summary-actions">
        <button
          type="button"
          className="import-btn import-btn-primary"
          onClick={() => {
            onClose?.();
            navigate("/participants");
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
