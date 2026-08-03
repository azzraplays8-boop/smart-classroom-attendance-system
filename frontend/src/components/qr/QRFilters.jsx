import { useEffect, useState } from "react";
import qrService from "../../services/qrService";

const QR_STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "generated", label: "Generated" },
  { value: "missing", label: "Missing" },
  { value: "printed", label: "Printed" },
];

function QRFilters({ filters, onFilterChange, onApply, onReset, loading }) {
  const [options, setOptions] = useState({ departments: [], levels: [], sections: [] });

  useEffect(() => {
    qrService
      .getFilterOptions()
      .then((data) => {
        if (data) {
          setOptions({
            departments: Array.isArray(data.departments) ? data.departments : [],
            levels: Array.isArray(data.levels) ? data.levels : [],
            sections: Array.isArray(data.sections) ? data.sections : [],
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="qr-filters-card">
      <div className="qr-filters-grid">
        <div className="qr-filter-item qr-filter-item--wide">
          <label className="qr-filter-label" htmlFor="qr-search">
            Search Participant
          </label>
          <input
            id="qr-search"
            type="text"
            className="qr-filter-control"
            placeholder="Participant ID or Name"
            value={filters.search}
            onChange={(e) => onFilterChange("search", e.target.value)}
          />
        </div>

        <div className="qr-filter-item">
          <label className="qr-filter-label" htmlFor="qr-department">
            Department
          </label>
          <select
            id="qr-department"
            className="qr-filter-control"
            value={filters.department}
            onChange={(e) => onFilterChange("department", e.target.value)}
          >
            <option value="">All Departments</option>
            {options.departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="qr-filter-item">
          <label className="qr-filter-label" htmlFor="qr-level">
            Level
          </label>
          <select
            id="qr-level"
            className="qr-filter-control"
            value={filters.level}
            onChange={(e) => onFilterChange("level", e.target.value)}
          >
            <option value="">All Levels</option>
            {options.levels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div className="qr-filter-item">
          <label className="qr-filter-label" htmlFor="qr-group">
            Group
          </label>
          <select
            id="qr-group"
            className="qr-filter-control"
            value={filters.group}
            onChange={(e) => onFilterChange("group", e.target.value)}
          >
            <option value="">All Groups</option>
            {options.sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="qr-filter-item">
          <label className="qr-filter-label" htmlFor="qr-status">
            QR Status
          </label>
          <select
            id="qr-status"
            className="qr-filter-control"
            value={filters.qrStatus}
            onChange={(e) => onFilterChange("qrStatus", e.target.value)}
          >
            {QR_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="qr-filter-actions">
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          onClick={onApply}
          disabled={loading}
        >
          {loading ? "Loading..." : "Apply Filters"}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-secondary"
          onClick={onReset}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default QRFilters;

