const translations = {
  en: {
    // Page
    settings: "Settings",
    loadingSettings: "Loading settings…",

    // Toast
    settingsSaved: "Settings saved successfully.",
    failedToSave: "Failed to save settings.",

    // Organization Information
    orgInfo: "Organization Information",
    orgName: "Organization Name",
    enterOrgName: "Enter organization name",
    orgLogo: "Organization Logo",
    chooseFile: "📁 Choose File",
    remove: "🗑 Remove",
    orgAddress: "Organization Address",
    enterOrgAddress: "Enter organization address",

    // Attendance Settings
    attendanceSettings: "Attendance Settings",
    timeZone: "Time Zone",
    attendanceStartTime: "Attendance Start Time",
    lateCutoffTime: "Late Cutoff Time",
    attendanceEndTime: "Attendance End Time",
    autoMarkAbsent: "Auto Mark Absent",
    autoMarkAbsentDesc:
      "When enabled, participants who have no attendance record after the attendance end time will automatically be marked as Absent.",
    gracePeriod: "Grace Period",
    attendanceMode: "Attendance Mode",

    // Organization Information (Academic)
    orgInfoSection: "Organization Information",
    orgYear: "Year / Term",
    enterOrgYear: "e.g. 2024-2025",
    semester: "Semester",
    defaultDepartmentList: "Default Department List (optional)",
    defaultDepartmentPlaceholder: "e.g. Engineering, Marketing, IT",
    commaSeparated: "Comma-separated list of default departments",

    // System Preferences
    systemPreferences: "System Preferences",
    theme: "Theme",
    light: "☀️ Light",
    dark: "🌙 Dark",
    systemDefault: "💻 System Default",
    primaryColor: "Primary Color",
    language: "Language",

    // Administrator
    administrator: "Administrator",
    name: "Name",
    role: "Role",
    email: "Email",
    adminName: "Administrator",
    adminRole: "System Administrator",
adminEmail: "admin@org.edu",
    changePassword: "🔑 Change Password",
    passwordComingSoon: "Password change feature coming soon.",

    // Save All
    saveAllSettings: "💾 Save All Settings",
    saveAllDesc: "Save all settings at once to ensure everything is persisted.",
    saving: "Saving…",
    savingAll: "Saving All…",
    save: "Save",

    // Settings Redesign
    settingsSubtitle: "Manage your organization preferences, attendance configuration and system settings.",
    navOrganization: "Organization",
    navAttendance: "Attendance",
    navAppearance: "Appearance",
    navAdministrator: "Administrator",
    cancel: "Cancel",
    saveChanges: "Save Changes",
    unsavedChanges: "You have unsaved changes.",
    themeLightDesc: "Bright and clean interface.",
    themeDarkDesc: "Dark and low-glare interface.",
    themeSystemDesc: "Match your device preference.",
    customColor: "Custom color",
    schedule: "Schedule",
    policies: "Policies",
    identity: "Identity",
    security: "Security",
    academic: "Academic Configuration",
    organizationSubtitle: "Manage your organization identity and academic configuration.",
    attendanceSubtitle: "Configure attendance windows, grace periods and marking rules.",
    appearanceSubtitle: "Customize the look and feel of the application.",
    administratorSubtitle: "Manage the administrator account and security.",

    // Semester options
    semester1st: "1st Semester",
    semester2nd: "2nd Semester",
    semesterSummer: "Summer",

    // Grace period options
    graceNone: "None",
    grace5: "5 minutes",
    grace10: "10 minutes",
    grace15: "15 minutes",
    grace20: "20 minutes",
    grace30: "30 minutes",

    // Attendance mode options
    qrOnly: "QR Code Only",
    manualOnly: "Manual Only",
    qrManual: "QR + Manual",

    // Timezone options
    tzManila: "(UTC+08:00) Asia/Manila",
    tzTokyo: "(UTC+09:00) Tokyo",
    tzBangkok: "(UTC+07:00) Bangkok",
    tzLondon: "(UTC+00:00) London",
    tzNewYork: "(UTC-05:00) New York",
  },

  fil: {
    // Page
    settings: "Mga Setting",
    loadingSettings: "Naglo-load ng mga setting…",

    // Toast
    settingsSaved: "Matagumpay na na-save ang mga setting.",
    failedToSave: "Hindi na-save ang mga setting.",

// Organization Information
    orgInfo: "Impormasyon ng Organisasyon",
    orgName: "Pangalan ng Organisasyon",
    enterOrgName: "Ilagay ang pangalan ng organisasyon",
    orgLogo: "Logo ng Organisasyon",
    chooseFile: "📁 Pumili ng File",
    remove: "🗑 Alisin",
    orgAddress: "Address ng Organisasyon",
    enterOrgAddress: "Ilagay ang address ng organisasyon",

    // Attendance Settings
    attendanceSettings: "Mga Setting ng Attendance",
    timeZone: "Time Zone",
    attendanceStartTime: "Oras ng Pagsisimula ng Attendance",
    lateCutoffTime: "Oras ng Huling Pagdating",
    attendanceEndTime: "Oras ng Pagtatapos ng Attendance",
    autoMarkAbsent: "Awtomatikong Markahan ang Absent",
    autoMarkAbsentDesc:
"Kapag naka-enable, ang mga kalahok na walang record ng attendance pagkatapos ng oras ng pagtatapos ay awtomatikong mamarkahan bilang Absent.",
    gracePeriod: "Grace Period",
    attendanceMode: "Mode ng Attendance",

// Organization Information
    orgInfoSection: "Impormasyon ng Organisasyon",
    orgYear: "Taon / Termino",
    enterOrgYear: "Hal. 2024-2025",
    semester: "Semestre",
    defaultDepartmentList: "Default na Listahan ng Departamento (opsyonal)",
    defaultDepartmentPlaceholder: "Hal. Engineering, Marketing, IT",
    commaSeparated: "Listahan ng mga departamentong pinaghihiwalay ng kuwit",

    // System Preferences
    systemPreferences: "Mga Kagustuhan ng System",
    theme: "Tema",
    light: "☀️ Liwanag",
    dark: "🌙 Madilim",
    systemDefault: "💻 Default ng System",
    primaryColor: "Pangunahing Kulay",
    language: "Wika",

    // Administrator
    administrator: "Administrator",
    name: "Pangalan",
    role: "Tungkulin",
    email: "Email",
    adminName: "Administrator",
    adminRole: "System Administrator",
adminEmail: "admin@org.edu",
    changePassword: "🔑 Palitan ang Password",
    passwordComingSoon: "Ang pagpapalit ng password ay darating pa.",

    // Save All
    saveAllSettings: "💾 I-save ang Lahat ng Setting",
    saveAllDesc: "I-save ang lahat ng setting nang sabay-sabay upang matiyak na lahat ay nai-save.",
    saving: "Sinasave…",
    savingAll: "Sinasave Lahat…",
    save: "I-save",

    // Settings Redesign
    settingsSubtitle: "Pamahalaan ang iyong mga kagustuhan sa organisasyon, configuration ng attendance at mga setting ng system.",
    navOrganization: "Organisasyon",
    navAttendance: "Attendance",
    navAppearance: "Hitsura",
    navAdministrator: "Administrator",
    cancel: "Kanselahin",
    saveChanges: "I-save ang mga Pagbabago",
    unsavedChanges: "Mayroon kang mga hindi pa nai-save na pagbabago.",
    themeLightDesc: "Maliwanag at malinis na interface.",
    themeDarkDesc: "Madilim at komportableng interface.",
    themeSystemDesc: "Sundan ang kagustuhan ng iyong device.",
    customColor: "Kustom na kulay",
    schedule: "Iskedyul",
    policies: "Mga Patakaran",
    identity: "Pagkakakilanlan",
    security: "Seguridad",
    academic: "Academic Configuration",
    organizationSubtitle: "Pamahalaan ang pagkakakilanlan ng organisasyon at academic configuration.",
    attendanceSubtitle: "I-configure ang mga oras ng attendance, grace period at mga panuntunan.",
    appearanceSubtitle: "I-customize ang hitsura at pakiramdam ng application.",
    administratorSubtitle: "Pamahalaan ang account ng administrator at seguridad.",

    // Semester options
    semester1st: "Unang Semestre",
    semester2nd: "Ikalawang Semestre",
    semesterSummer: "Tag-init",

    // Grace period options
    graceNone: "Wala",
    grace5: "5 minuto",
    grace10: "10 minuto",
    grace15: "15 minuto",
    grace20: "20 minuto",
    grace30: "30 minuto",

    // Attendance mode options
    qrOnly: "QR Code Lamang",
    manualOnly: "Manual Lamang",
    qrManual: "QR + Manual",

    // Timezone options
    tzManila: "(UTC+08:00) Asia/Manila",
    tzTokyo: "(UTC+09:00) Tokyo",
    tzBangkok: "(UTC+07:00) Bangkok",
    tzLondon: "(UTC+00:00) London",
    tzNewYork: "(UTC-05:00) New York",
  },
};

export default translations;

