/**
 * Organization Type Configuration Defaults
 * 
 * Defines labels and terminology for each supported organization type.
 * Used by the settings system to dynamically render appropriate labels.
 * 
 * To add a new organization type, simply add a new entry to ORG_TYPE_CONFIGS.
 */

// ── These must be defined BEFORE DEFAULT_ORG_SETTINGS to avoid TDZ ReferenceError ──
const DEFAULT_ATTENDANCE_START = "07:30";
const DEFAULT_LATE_CUTOFF = "08:00";
const DEFAULT_ATTENDANCE_END = "17:00";

export const ORG_TYPE_CONFIGS = {
  school: {
    id: "school",
    label: "School",
    icon: "🏫",
    entity: {
      entityName: "Participant",
      entityLabel: "Participants",
      entityNamePlural: "Participants",
      primaryIdLabel: "Participant ID",
      departmentLabel: "Course / Strand",
      groupLabel: "Section",
      roleLabel: "Year Level",
    },
    attendance: {
      registeredMemberLabel: "Participants",
      checkedInLabel: "Present",
      lateLabel: "Late",
      absentLabel: "Absent",
    },
  },
  university: {
    id: "university",
    label: "University",
    icon: "🎓",
    entity: {
      entityName: "Participant",
      entityLabel: "Participants",
      entityNamePlural: "Participants",
      primaryIdLabel: "Participant ID",
      departmentLabel: "College / Department",
      groupLabel: "Section",
      roleLabel: "Year Level",
    },
    attendance: {
      registeredMemberLabel: "Participants",
      checkedInLabel: "Present",
      lateLabel: "Late",
      absentLabel: "Absent",
    },
  },
  organization: {
    id: "organization",
    label: "Organization",
    icon: "🏢",
    entity: {
      entityName: "Member",
      entityLabel: "Members",
      entityNamePlural: "Members",
      primaryIdLabel: "Member ID",
      departmentLabel: "Department",
      groupLabel: "Committee",
      roleLabel: "Position",
    },
    attendance: {
      registeredMemberLabel: "Members",
      checkedInLabel: "Checked In",
      lateLabel: "Late",
      absentLabel: "Absent",
    },
  },
  company: {
    id: "company",
    label: "Company",
    icon: "🏭",
    entity: {
      entityName: "Employee",
      entityLabel: "Employees",
      entityNamePlural: "Employees",
      primaryIdLabel: "Employee ID",
      departmentLabel: "Department",
      groupLabel: "Team",
      roleLabel: "Job Position",
    },
    attendance: {
      registeredMemberLabel: "Employees",
      checkedInLabel: "Checked In",
      lateLabel: "Late",
      absentLabel: "Absent",
    },
  },
  event: {
    id: "event",
    label: "Event",
    icon: "🎪",
    entity: {
      entityName: "Participant",
      entityLabel: "Participants",
      entityNamePlural: "Participants",
      primaryIdLabel: "Registration ID",
      departmentLabel: "Organization",
      groupLabel: "Batch",
      roleLabel: "Role",
    },
    attendance: {
      registeredMemberLabel: "Participants",
      checkedInLabel: "Checked In",
      lateLabel: "Late",
      absentLabel: "No Show",
    },
  },
  church: {
    id: "church",
    label: "Church",
    icon: "⛪",
    entity: {
      entityName: "Member",
      entityLabel: "Members",
      entityNamePlural: "Members",
      primaryIdLabel: "Member ID",
      departmentLabel: "Ministry",
      groupLabel: "Group",
      roleLabel: "Position",
    },
    attendance: {
      registeredMemberLabel: "Members",
      checkedInLabel: "Present",
      lateLabel: "Late",
      absentLabel: "Absent",
    },
  },
  government: {
    id: "government",
    label: "Government Agency",
    icon: "🏛️",
    entity: {
      entityName: "Employee",
      entityLabel: "Personnel",
      entityNamePlural: "Personnel",
      primaryIdLabel: "Employee ID",
      departmentLabel: "Department",
      groupLabel: "Division",
      roleLabel: "Position",
    },
    attendance: {
      registeredMemberLabel: "Personnel",
      checkedInLabel: "Present",
      lateLabel: "Late",
      absentLabel: "Absent",
    },
  },
  seminar: {
    id: "seminar",
    label: "Seminar",
    icon: "📚",
    entity: {
      entityName: "Attendee",
      entityLabel: "Attendees",
      entityNamePlural: "Attendees",
      primaryIdLabel: "Registration ID",
      departmentLabel: "Organization",
      groupLabel: "Batch",
      roleLabel: "Role",
    },
    attendance: {
      registeredMemberLabel: "Attendees",
      checkedInLabel: "Checked In",
      lateLabel: "Late",
      absentLabel: "No Show",
    },
  },
  conference: {
    id: "conference",
    label: "Conference",
    icon: "🎤",
    entity: {
      entityName: "Delegate",
      entityLabel: "Delegates",
      entityNamePlural: "Delegates",
      primaryIdLabel: "Badge ID",
      departmentLabel: "Organization",
      groupLabel: "Track",
      roleLabel: "Role",
    },
    attendance: {
      registeredMemberLabel: "Delegates",
      checkedInLabel: "Checked In",
      lateLabel: "Late",
      absentLabel: "No Show",
    },
  },
  kataga: {
    id: "kataga",
    label: "KATAGA",
    icon: "🤝",
    entity: {
      entityName: "Member",
      entityNamePlural: "Members",
      primaryIdLabel: "Member ID",
      departmentLabel: "Department",
      groupLabel: "Committee",
      roleLabel: "Position",
    },
    attendance: {
      registeredMemberLabel: "Members",
      checkedInLabel: "Present",
      lateLabel: "Late",
      absentLabel: "Absent",
    },
  },
};

/**
 * Returns the configuration for a given organization type.
 * Falls back to 'school' if the type is not found.
 */
export function getOrgConfig(orgType) {
  return ORG_TYPE_CONFIGS[orgType] || ORG_TYPE_CONFIGS.school;
}

/**
 * Returns all organization type options for dropdown selection.
 */
export function getOrgTypeOptions() {
  return Object.entries(ORG_TYPE_CONFIGS).map(([id, config]) => ({
    value: id,
    label: `${config.icon} ${config.label}`,
  }));
}

export const DEFAULT_ORG_TYPE = "school";

export const DEFAULT_ORG_SETTINGS = {
  organizationName: "",
  organizationLogo: "",
  organizationType: DEFAULT_ORG_TYPE,
  organizationAddress: "",

  // Entity labels (overridden by org type, but can be customized)
  entityName: "",
  entityLabel: "",
  primaryIdLabel: "",
  departmentLabel: "",
  groupLabel: "",
  roleLabel: "",

  // Attendance terminology
  checkedInLabel: "",
  lateLabel: "",
  absentLabel: "",

  // Existing settings kept as-is
  attendanceStartTime: DEFAULT_ATTENDANCE_START || "07:30",
  lateCutoffTime: DEFAULT_LATE_CUTOFF || "08:00",
  attendanceEndTime: DEFAULT_ATTENDANCE_END || "17:00",
  autoMarkAbsent: true,
  timezone: "(UTC+08:00) Asia/Manila",
  gracePeriod: "None",
  attendanceMode: "QR + Manual",

    // Academic (school-specific) - the single source of truth for academic
  // configuration. These values are written by Settings → Academic
  // Configuration and consumed everywhere (participant forms, attendance,
  // reports, viewer pages). Stored as comma-separated strings to stay
  // compatible with the backend settings table; parsed on read.
  academicYear: "", // e.g. "2026-2027"
  schoolYear: "", // legacy alias (back-compat)
  semester: "1st", // "1st" | "2nd" | "Summer"
  departmentOptions: "BSIT,BSCS,BSECE,BEED,BSTM,BSBA,ABM,STEM", // department / course list
  courseOptions: "", // additional course codes (optional)
  sectionOptions: "A,B,C,D", // section / team list
  yearLevelOptions: ["1st", "2nd", "3rd", "4th"], // year-level values

  // Academic (legacy fields kept for backward compatibility)
  defaultCourses: "",

  // System preferences
  theme: "light",
  primaryColor: "#4f46e5",
  language: "en",
  dateFormat: "YYYY-MM-DD",
  timeFormat: "h:mm A",
  qrFormat: "svg",
  brandColor: "#4f46e5",
};

