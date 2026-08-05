/**
 * importColumnMapping.js
 * ------------------------------------------------------------------
 * Field metadata + synonym-based auto-detection for the Bulk Import
 * Participants wizard.
 *
 * This keeps the mapping logic modular and reusable so external
 * spreadsheets (Registrar, Google Sheets, Microsoft Excel, LibreOffice)
 * can be matched automatically, with manual override available in the UI.
 */

// The canonical participant fields the system understands.
export const IMPORT_FIELDS = {
  participantIdentifier: {
    label: "Participant ID",
    required: true,
    synonyms: [
      "participant id",
      "participant_id",
      "participantid",
      "student number",
      "student no",
      "student no.",
      "student_number",
      "studentno",
      "id number",
      "id no",
      "idno",
      "id",
      "participant number",
      "member id",
      "employee id",
      "employee number",
      "lrn",
      "control no",
      "control number",
    ],
  },
  lastName: {
    label: "Last Name",
    required: true,
    synonyms: [
      "last name",
      "lastname",
      "surname",
      "family name",
      "familyname",
      "lname",
      "apelyido",
      "last",
    ],
  },
  firstName: {
    label: "First Name",
    required: true,
    synonyms: [
      "first name",
      "firstname",
      "given name",
      "givenname",
      "fname",
      "first",
      "pangalan",
    ],
  },
  middleName: {
    label: "Middle Name",
    required: true,
    synonyms: [
      "middle name",
      "middlename",
      "mname",
      "middle initial",
      "middle",
    ],
  },
  gender: {
    label: "Gender",
    required: true,
    synonyms: [
      "gender",
      "sex",
      "sexe",
      "kasarian",
    ],
  },
  dateOfBirth: {
    label: "Date of Birth",
    required: false,
    synonyms: [
      "date of birth",
      "birthdate",
      "birth date",
      "dob",
      "birthday",
      "dateborn",
    ],
  },
  email: {
    label: "Email Address",
    required: true,
    synonyms: [
      "email",
      "email address",
      "emailaddress",
      "e-mail",
      "e mail",
      "mail",
      "email add",
    ],
  },
  contactNumber: {
    label: "Contact Number",
    required: true,
    synonyms: [
      "contact number",
      "contactnumber",
      "phone",
      "phone number",
      "phonenumber",
      "mobile",
      "mobile number",
      "cellphone",
      "cellphone number",
      "telephone",
      "telephone number",
      "cp number",
      "contact no",
      "contact no.",
    ],
  },
  department: {
    label: "Department / Group",
    required: true,
    synonyms: [
      "department",
      "department/group",
      "dept",
      "course",
      "program",
      "program of study",
      "strand",
      "college",
      "faculty",
      "division",
      "group",
      "grouping",
    ],
  },
  level: {
    label: "Category",
    required: true,
    synonyms: [
      "year",
      "year level",
      "yearlevel",
      "level",
      "category",
      "grade",
      "grade level",
      "grading",
      "student year",
      "yr",
    ],
  },
  groupName: {
    label: "Team",
    required: true,
    synonyms: [
      "section",
      "team",
      "block",
      "group section",
      "class",
      "advisory",
      "cluster",
      "cohort",
    ],
  },
  status: {
    label: "Status",
    required: false,
    synonyms: [
      "status",
      "participant status",
      "member status",
      "state",
    ],
  },
};

// Used to render the dropdown options in the mapping step.
export const FIELD_OPTIONS = Object.keys(IMPORT_FIELDS).map((key) => ({
  value: key,
  label: IMPORT_FIELDS[key].label,
  required: IMPORT_FIELDS[key].required,
}));

const normalizeKey = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Auto-detect the best field for a spreadsheet header.
 * Returns the canonical field key, or null if unknown.
 */
export function detectFieldForHeader(header) {
  const key = normalizeKey(header);
  if (!key) return null;

  for (const [fieldKey, def] of Object.entries(IMPORT_FIELDS)) {
    for (const syn of [...def.synonyms, def.label]) {
      if (normalizeKey(syn) === key) {
        return fieldKey;
      }
    }
  }

  // Fuzzy: if the header contains a dominant keyword, still match.
  // e.g. "Student ID Number" -> participantIdentifier
  const contains = (words) => words.some((w) => key.includes(w));

  if (contains(["participant", "student", "id no", "id number", "control", "lrn"])) {
    return "participantIdentifier";
  }
  if (contains(["surname", "last"])) return "lastName";
  if (contains(["given", "first"])) return "firstName";
  if (contains(["middle"])) return "middleName";
  if (contains(["gender", "sex"])) return "gender";
  if (contains(["birth", "dob", "birthday"])) return "dateOfBirth";
  if (contains(["email", "mail"])) return "email";
  if (contains(["contact", "phone", "mobile", "cell", "telephone"])) return "contactNumber";
  if (contains(["department", "course", "program", "strand", "college", "dept", "group"])) return "department";
  if (contains(["year", "level", "category", "grade"])) return "level";
  if (contains(["section", "team", "block", "class", "advisory", "cluster"])) return "groupName";
  if (contains(["status", "state"])) return "status";

  return null;
}

/**
 * Build an initial mapping object { fieldKey: header } from spreadsheet headers.
 * Ensures each field is only assigned once (first match wins).
 */
export function buildInitialMapping(headers) {
  const mapping = {};
  const usedHeaders = new Set();

  for (const header of headers) {
    if (usedHeaders.has(header)) continue;
    const field = detectFieldForHeader(header);
    if (field && !mapping[field]) {
      mapping[field] = header;
      usedHeaders.add(header);
    }
  }

  return mapping;
}

/**
 * Returns the list of required fields that are not yet mapped.
 */
export function getMissingRequiredFields(mapping) {
  return Object.keys(IMPORT_FIELDS).filter(
    (key) => IMPORT_FIELDS[key].required && !mapping[key]
  );
}
