/**
 * Frontend mirror of the backend attendance policy
 * (backend/src/config/attendancePolicy.js). Keep values in sync — the
 * backend remains the authoritative enforcement source; this file only
 * formats/labels for display.
 */
export const ATTENDANCE_POLICY = {
  LATES_PER_ABSENCE: 3,
  ADMIN_REVIEW_THRESHOLD: 3,
  STATUSES: ["Present", "Late", "Absent", "Excused"],
};

export function getLateAbsenceEquivalent(lateCount) {
  return Math.floor(Math.max(0, Number(lateCount) || 0) / ATTENDANCE_POLICY.LATES_PER_ABSENCE);
}

export function computeEffectiveAbsences(actualAbsences, lateCount) {
  return Math.max(0, Number(actualAbsences) || 0) + getLateAbsenceEquivalent(lateCount);
}

export function getAttendanceStanding(effectiveAbsences) {
  const count = Math.max(0, Number(effectiveAbsences) || 0);
  if (count === 0) return { status: "Good Standing", tone: "good" };
  if (count === 1) return { status: "First Attendance Warning", tone: "warning" };
  if (count === 2) return { status: "Final Attendance Warning", tone: "final-warning" };
  return { status: "Requires Administrative Review", tone: "admin-review" };
}

export function buildStandingBreakdown({ present = 0, late = 0, absent = 0, excused = 0 }) {
  const actualAbsences = Math.max(0, Number(absent) || 0);
  const lateCount = Math.max(0, Number(late) || 0);
  const lateEquivalent = getLateAbsenceEquivalent(lateCount);
  const effectiveAbsences = actualAbsences + lateEquivalent;
  const standing = getAttendanceStanding(effectiveAbsences);
  return {
    present: Math.max(0, Number(present) || 0),
    late: lateCount,
    absent: actualAbsences,
    excused: Math.max(0, Number(excused) || 0),
    lateEquivalentAbsences: lateEquivalent,
    effectiveAbsences,
    standing: standing.status,
    standingTone: standing.tone,
  };
}

/** Current month window in the local browser timezone: {year, month, label}. */
export function getCurrentMonthLocal(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const label = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { year, month, label };
}

export function buildMonthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
