import React from "react";

import "../../styles/participants/ParticipantModal.css";
import { useAcademicConfig } from "../../hooks/useAcademicConfig";

function DepartmentSelect({ id, label, value, onChange, required, error, showError, options }) {
  return (
    <div className="sis-field">
      <label className="sis-label" htmlFor={id}>
        {label} {required ? <span className="sis-req">*</span> : null}
      </label>

      <select
        className="sis-input"
        id={id}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={showError && error ? `${id}-error` : undefined}
      >
        <option value="">Select department / group</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>

      {showError && error ? (
        <div className="sis-error" id={`${id}-error`}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

export default function ParticipantInformationSection({
  values,
  errors,
  touched,
  setField,
  markTouched,
  onYearLevelChange,
  onSectionChange,
  availableSectionOptions,
}) {
  // Academic configuration is the single source of truth (set in Settings).
  // Departments and year levels are read from there instead of being
  // hardcoded here.
  const { departments, yearLevels, formatYearLevelLabel } = useAcademicConfig();

  const visibleError = (key) => {
    return touched?.[key] || (!touched || Object.keys(touched).length === 0 ? Boolean(errors?.[key]) : false);
  };

  return (
    <section
      className="sis-card"
      aria-label="DEPARTMENT & GROUPING"
      style={{
        clear: "both",
      }}
    >
      <header className="sis-card-header">
        <div className="sis-card-title">Department &amp; Grouping</div>
      </header>

      <div className="sis-grid sis-grid-3">
        <DepartmentSelect
          id="course"
          label="Department / Group"
          required
          options={departments}
          value={values.course}
          onChange={(v) =>
            setField("course")({
              target: {
                value: v,
              },
            })
          }
          error={errors.course}
          showError={Boolean(visibleError("course"))}
        />

        <div className="sis-field">
          <label className="sis-label" htmlFor="yearLevel">
            Category <span className="sis-req">*</span>
          </label>

          <select
            className="sis-input"
            id="yearLevel"
            value={values.yearLevel}
            onChange={(e) => onYearLevelChange?.(e.target.value)}
            onBlur={() => markTouched?.("yearLevel")?.()}
            aria-invalid={Boolean(errors.yearLevel)}
            aria-describedby={
              visibleError("yearLevel") && errors.yearLevel ? "yearLevel-error" : undefined
            }
          >
            <option value="">Select category</option>
            {yearLevels.map((lvl) => (
              <option key={lvl} value={lvl}>
                {formatYearLevelLabel(lvl)}
              </option>
            ))}
          </select>

          {visibleError("yearLevel") && errors.yearLevel ? (
            <div className="sis-error" id="yearLevel-error">
              {errors.yearLevel}
            </div>
          ) : null}
        </div>

        <div className="sis-field">
          <label className="sis-label" htmlFor="section">
            Team <span className="sis-req">*</span>
          </label>

          <select
            className="sis-input"
            id="section"
            value={values.section}
            disabled={!values.yearLevel}
            onChange={(e) => onSectionChange?.(e.target.value)}
            onBlur={() => markTouched?.("section")?.()}
            aria-invalid={Boolean(errors.section)}
            aria-describedby={
              visibleError("section") && errors.section ? "section-error" : undefined
            }
          >
            <option value="">
              {values.yearLevel ? "Select team" : "Select category first"}
            </option>
            {availableSectionOptions.map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </select>

          {visibleError("section") && errors.section ? (
            <div className="sis-error" id="section-error">
              {errors.section}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
