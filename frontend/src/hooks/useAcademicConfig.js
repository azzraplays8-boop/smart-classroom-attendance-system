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

function firstConfiguredList(...values) {
  for (const value of values) {
    const parsed = parseList(value);
    if (parsed.length) return parsed;
  }
  return [];
}

function configuredList(settings, primaryKey, fallbackKey) {
  if (Object.prototype.hasOwnProperty.call(settings, primaryKey)) {
    return parseList(settings[primaryKey]);
  }
  return firstConfiguredList(settings[fallbackKey]);
}

export function normalizeAcademicSettings(settings = {}) {
  const academicYear = settings.academicYear ?? settings.schoolYear ?? settings.orgYear ?? "";
  const semester = settings.semester ?? settings.academicSemester ?? "1st";

  // Edited form fields (defaultDepartments/defaultSections/positionLevels)
  // take priority over their mirror fields — mirror fields are only fallbacks.
  const departmentList = configuredList(settings, "defaultDepartments", "departmentOptions");
  const sectionList = configuredList(settings, "defaultSections", "sectionOptions");
  const yearList = configuredList(settings, "positionLevels", "yearLevelOptions");

  return {
    academicYear,
    semester,
    departmentValue: departmentList.join(", "),
    sectionValue: sectionList.join(", "),
    yearValue: yearList.join(", "),
  };
}

/**
 * Split a comma-separated value (or an array) into a clean list of strings.
 */
export function parseList(value) {
  if (value == null) return [];
  const entries = Array.isArray(value) ? value : String(value).split(",");
  const seen = new Set();

  return entries
    .map((v) => String(v).trim())
    .filter((v) => {
      if (!v || seen.has(v)) return false;
      seen.add(v);
      return true;
    });
}

export const SEMESTER_OPTIONS = [
  { value: "1st", label: "1st Semester" },
  { value: "2nd", label: "2nd Semester" },
  { value: "Summer", label: "Summer" },
];

// Fallback defaults kept in ONE place (the centralized config). Used only when
// no value has been configured yet so forms remain usable.
const DEFAULT_SECTIONS = parseList(DEFAULT_ORG_SETTINGS.sectionOptions || "");
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
    const { academicYear, semester, departmentValue, sectionValue, yearValue } = normalizeAcademicSettings(settings);

    const departments = parseList(departmentValue);
    const fromCourses = parseList(settings.defaultCourses ?? settings.courseOptions ?? "");
    const sections = parseList(sectionValue);

    let yearLevels = parseList(yearValue);
    if (!yearLevels.length) yearLevels = DEFAULT_YEAR_LEVELS;

    return {
      academicYear,
      semester,
      departments,
      courses: fromCourses,
      sections: sections.length ? sections : DEFAULT_SECTIONS,
      yearLevels,
      semesterOptions: SEMESTER_OPTIONS,
      formatYearLevelLabel,
      formatSemesterLabel,
    };
  }, [settings]);
}

export default useAcademicConfig;
