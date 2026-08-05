/**
 * ImportPreviewTable
 * Shows a paginated preview of parsed rows plus validation statistics
 * (total, valid, duplicates, invalid emails, missing fields, empty cells).
 */
export default function ImportPreviewTable({
  rows,
  stats,
  mapping,
  previewLimit = 8,
}) {
  const previewRows = rows.slice(0, previewLimit);

  const statCards = [
    { key: "total", label: "Total Rows", color: "#0f172a" },
    { key: "valid", label: "Valid Rows", color: "#16a34a" },
    { key: "duplicates", label: "Duplicate IDs", color: "#f59e0b" },
    { key: "invalidEmails", label: "Invalid Emails", color: "#ef4444" },
    { key: "missingRequired", label: "Missing Required Fields", color: "#ef4444" },
    { key: "emptyCells", label: "Empty Cells", color: "#64748b" },
  ];

  return (
    <div className="import-preview">
      <div className="import-preview-stats">
        {statCards.map((s) => (
          <div className="import-stat" key={s.key}>
            <div className="import-stat-value" style={{ color: s.color }}>
              {stats?.[s.key] ?? 0}
            </div>
            <div className="import-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {stats && (stats.duplicates > 0 || stats.invalidEmails > 0 || stats.missingRequired > 0) ? (
        <div className="import-warning-banner" role="alert">
          ⚠️ Some rows have issues. They will be excluded from the import unless you
          fix them in the spreadsheet. Review the summary below, then choose
          <b> Import Valid Rows Only</b> or <b>Cancel</b>.
        </div>
      ) : null}

      <div className="import-preview-table-wrap">
        <table className="import-table">
          <thead>
            <tr>
              <th>#</th>
              {Object.keys(mapping || {}).map((field) => (
                <th key={field}>{field}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.length === 0 ? (
              <tr>
                <td colSpan={Object.keys(mapping || {}).length + 1} className="import-empty">
                  No rows to preview.
                </td>
              </tr>
            ) : (
              previewRows.map((row, i) => (
                <tr key={i}>
                  <td className="import-rownum">{i + 1}</td>
                  {Object.keys(mapping || {}).map((field) => (
                    <td key={field}>{String(row?.[mapping[field]] ?? "")}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rows.length > previewLimit ? (
        <div className="import-preview-more">
          Showing first {previewLimit} of {rows.length} rows.
        </div>
      ) : null}
    </div>
  );
}
