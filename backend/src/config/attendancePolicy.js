/**
 * Centralized attendance policy / configuration source.
 * Single source of truth for warning thresholds, late conversion and statuses.
 * Adjust values here — no other file hardcodes the logic.
 */
export const ATTENDANCE_POLICY = {
  // 3 Lates = 1 effective absence
  LATES_PER_ABSENCE: 3,

  // Warning thresholds based on effective absences (actual absences + late equivalent)
  WARNING_THRESHOLDS: [
    { maxEffectiveAbsences: 0, status: "Good Standing", tone: "good" },
    { maxEffectiveAbsences: 1, status: "First Attendance Warning", tone: "warning" },
    { maxEffectiveAbsences: 2, status: "Final Attendance Warning", tone: "final-warning" },
  ],
  // Anything at or above this count:
  ADMIN_REVIEW_THRESHOLD: 3,
  ADMIN_REVIEW_STATUS: "Requires Administrative Review",

  // Recognized attendance statuses
  STATUSES: ["Present", "Late", "Absent", "Excused"],
};

export function getLateAbsenceEquivalent(lateCount) {
  return Math.floor(Math.max(0, Number(lateCount) || 0) / ATTENDANCE_POLICY.LATES_PER_ABSENCE);
}

export function computeEffectiveAbsences(actualAbsences, lateCount) {
  return (
    Math.max(0, Number(actualAbsences) || 0) + getLateAbsenceEquivalent(lateCount)
  );
}

export function getAttendanceStanding(effectiveAbsences) {
  const count = Math.max(0, Number(effectiveAbsences) || 0);
  if (count >= ATTENDANCE_POLICY.ADMIN_REVIEW_THRESHOLD) {
    return { status: ATTENDANCE_POLICY.ADMIN_REVIEW_STATUS, tone: "admin-review" };
  }
  for (let i = ATTENDANCE_POLICY.WARNING_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    const level = ATTENDANCE_POLICY.WARNING_THRESHOLDS[i];
    if (count <= level.maxEffectiveAbsences) {
      return { status: level.status, tone: level.tone };
    }
  }
  return { status: ATTENDANCE_POLICY.ADMIN_REVIEW_STATUS, tone: "admin-review" };
}

/** Build the full disciplinary breakdown for a participant's month. */
export function buildStandingBreakdown({ present, late, absent, excused }) {
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
