/**
 * useAcademicConfig - Centralized academic configuration (single source of truth).
 *
 * The Settings → Academic Configuration page is the ONLY place that edits
 * academic data. It writes those values into the SettingsContext (which is
 * persisted to localStorage via the existing `app_org_settings` mechanism),
 * and every other consumer — Add/Edit Participant forms, attendance pages,
 * reports, viewer pages — reads from this same hook. There is no duplicated
 * hardcoded academic list anywhere else in the UI.
 *
 * Fields are stored as comma-separated strings in the settings store (to stay
 * compatible with the backend settings table) and parsed into arrays here.
 */
import { useMemo } from "react";
import { useSettings } from "../context/SettingsContext";
import { DEFAULT_ORG_SETTINGS } from "../config/organizationDefaults";

/**
 * Split a comma-separated value (or an array) into a clean list of strings.
 */
export function parseList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export const SEMESTER_OPTIONS = [
  { value: "1st", label: "1st Semester" },
  { value: "2nd", label: "2nd Semester" },
  { value: "Summer", label: "Summer" },
];

// Fallback defaults kept in ONE place (the centralized config). Used only when
// no value has been configured yet so forms remain usable.
const DEFAULT_DEPARTMENTS = parseList(
  DEFAULT_ORG_SETTINGS.departmentOptions || "BSIT,BSCS,BSECE,BEED,BSTM,BSBA,ABM,STEM"
);
const DEFAULT_SECTIONS = parseList(DEFAULT_ORG_SETTINGS.sectionOptions || "A,B,C,D");
const DEFAULT_YEAR_LEVELS =
  Array.isArray(DEFAULT_ORG_SETTINGS.yearLevelOptions) &&
  DEFAULT_ORG_SETTINGS.yearLevelOptions.length
    ? DEFAULT_ORG_SETTINGS.yearLevelOptions
    : ["1st", "2nd", "3rd", "4th"];

/**
 * Format a year-level value ("1st") for display ("1st Year").
 * Numeric ordinal levels get a "Year" suffix; other values are shown as-is.
 */
export function formatYearLevelLabel(value) {
  const v = String(value == null ? "" : value).trim();
  if (/^\d+(st|nd|rd|th)$/i.test(v)) return `${v} Year`;
  return v;
}

/**
 * Format a semester value ("1st") for display ("1st Semester").
 */
export function formatSemesterLabel(value) {
  const found = SEMESTER_OPTIONS.find((o) => o.value === value);
  return found ? found.label : String(value == null ? "" : value) || "—";
}

/**
 * Hook: read the current academic configuration from the SettingsContext.
 * Re-computes whenever settings change (reactive).
 */
export function useAcademicConfig() {
  const { settings = {} } = useSettings();

  return useMemo(() => {
    // Academic year (resolve canonical field name first, then legacy aliases)
    const academicYear =
      settings.academicYear ?? settings.schoolYear ?? settings.orgYear ?? "";

    // Semester
    const semester =
      settings.semester ?? settings.academicSemester ?? "1st";

    // Departments / courses — prefer the configured department list, then the
    // course list, then fall back to the centralized default list.
    const fromDepartments = parseList(
      settings.departmentOptions ?? settings.defaultDepartments ?? ""
    );
    const fromCourses = parseList(
      settings.courseOptions ?? settings.defaultCourses ?? ""
    );
    const departments = fromDepartments.length
      ? fromDepartments
      : fromCourses.length
      ? fromCourses
      : DEFAULT_DEPARTMENTS;

    const sections =
      parseList(settings.sectionOptions ?? settings.defaultSections ?? "") ||
      DEFAULT_SECTIONS;

    let yearLevels = parseList(settings.yearLevelOptions ?? settings.positionLevels ?? "");
    if (!yearLevels.length) yearLevels = DEFAULT_YEAR_LEVELS;

    return {
      academicYear,
      semester,
      departments,
      courses: fromCourses,
      sections,
      yearLevels,
      semesterOptions: SEMESTER_OPTIONS,
      formatYearLevelLabel,
      formatSemesterLabel,
    };
  }, [settings]);
}

export default useAcademicConfig;
