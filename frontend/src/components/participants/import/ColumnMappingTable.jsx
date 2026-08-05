import { IMPORT_FIELDS, FIELD_OPTIONS } from "../../../utils/importColumnMapping";

/**
 * ColumnMappingTable
 * Shows each detected spreadsheet column with a dropdown to map it to a
 * participant field. Auto-detected mappings are pre-selected.
 */
export default function ColumnMappingTable({ headers, mapping, onChange }) {
  const usedFields = new Set(Object.values(mapping || {}));

  const handleChange = (header, fieldKey) => {
    // Remove previous mapping that used this field
    const next = { ...(mapping || {}) };
    for (const [h, f] of Object.entries(next)) {
      if (f === fieldKey) delete next[h];
    }
    if (fieldKey) {
      next[fieldKey] = header;
    } else {
      // Unmap: remove any mapping pointing to this header
      for (const [h, f] of Object.entries(next)) {
        if (h === fieldKey) delete next[h];
      }
      delete next[header];
    }
    onChange?.(next);
  };

  return (
    <div className="import-mapping">
      <div className="import-mapping-header">
        <div>Spreadsheet Column</div>
        <div>Map to Participant Field</div>
      </div>

      {headers.map((header) => {
        // Find which field is currently mapped to this header
        let currentField = "";
        for (const [field, h] of Object.entries(mapping || {})) {
          if (h === header) currentField = field;
        }

        return (
          <div className="import-mapping-row" key={header}>
            <div className="import-mapping-col">
              <span className="import-mapping-col-name">{header}</span>
              <span className="import-mapping-col-sample">
                {header ? "•" : ""}
              </span>
            </div>

            <div className="import-mapping-field">
              <select
                className="import-select"
                value={currentField}
                onChange={(e) => handleChange(header, e.target.value)}
                aria-label={`Map column ${header}`}
              >
                <option value="">— Do not import —</option>
                {FIELD_OPTIONS.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={usedFields.has(opt.value) && currentField !== opt.value}
                  >
                    {opt.label}
                    {opt.required ? " *" : ""}
                  </option>
                ))}
              </select>
              {currentField && IMPORT_FIELDS[currentField]?.required ? (
                <span className="import-required-badge">Required</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
