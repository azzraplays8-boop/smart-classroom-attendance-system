import { useEffect, useState } from "react";
import qrService from "../../services/qrService";

const QR_STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "generated", label: "Generated" },
  { value: "missing", label: "Missing" },
  { value: "printed", label: "Printed" },
];

function QRFilters({ filters, onFilterChange, onApply, onReset, loading }) {
  const [options, setOptions] = useState({ courses: [], years: [], sections: [] });

  useEffect(() => {
    qrService
      .getFilterOptions()
      .then((data) => {
        if (data) {
          setOptions({
            courses: Array.isArray(data.courses) ? data.courses : [],
            years: Array.isArray(data.years) ? data.years : [],
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
            Search Student
          </label>
          <input
            id="qr-search"
            type="text"
            className="qr-filter-control"
            placeholder="Student Number or Name"
            value={filters.search}
            onChange={(e) => onFilterChange("search", e.target.value)}
          />
        </div>

        <div className="qr-filter-item">
          <label className="qr-filter-label" htmlFor="qr-course">
            Course
          </label>
          <select
            id="qr-course"
            className="qr-filter-control"
            value={filters.course}
            onChange={(e) => onFilterChange("course", e.target.value)}
          >
            <option value="">All Courses</option>
            {options.courses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="qr-filter-item">
          <label className="qr-filter-label" htmlFor="qr-year">
            Year Level
          </label>
          <select
            id="qr-year"
            className="qr-filter-control"
            value={filters.year}
            onChange={(e) => onFilterChange("year", e.target.value)}
          >
            <option value="">All Years</option>
            {options.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="qr-filter-item">
          <label className="qr-filter-label" htmlFor="qr-section">
            Section
          </label>
          <select
            id="qr-section"
            className="qr-filter-control"
            value={filters.section}
            onChange={(e) => onFilterChange("section", e.target.value)}
          >
            <option value="">All Sections</option>
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

