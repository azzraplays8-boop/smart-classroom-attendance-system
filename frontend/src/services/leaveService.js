export const LEAVE_TYPES = [
  { key: "sick_leave", label: "Sick Leave", allocation: 5, maxDaysPerRequest: 5 },
  { key: "personal_leave", label: "Personal Leave", allocation: 3, maxDaysPerRequest: 2 },
  { key: "emergency_leave", label: "Emergency Leave", allocation: 3, maxDaysPerRequest: 5 },
  { key: "mental_health_leave", label: "Mental Health Leave", allocation: 3, maxDaysPerRequest: 1 },
  { key: "academic_leave", label: "Academic Leave", allocation: 5, maxDaysPerRequest: 3 },
];

export const LEAVE_ALLOCATION_MAP = Object.fromEntries(LEAVE_TYPES.map((type) => [type.key, type.allocation]));
export const LEAVE_STORAGE_KEY = "kataga_leave_records_v1";

const LEAVE_TIME_ZONE = "Asia/Manila";

export function getLeaveMonthKey(value = new Date()) {
  if (typeof value === "string") {
    const dateOnlyMatch = value.trim().match(/^(\d{4})-(\d{2})-\d{2}$/);
    if (dateOnlyMatch) return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}`;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LEAVE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : "";
}

export function normalizeLeaveType(value) {
  if (!value && value !== 0) return "sick_leave";
  const raw = String(value).trim().toLowerCase().replace(/[_\-\s]+/g, "_");
  const match = LEAVE_TYPES.find((type) =>
    type.key === raw ||
    type.label.toLowerCase().replace(/\s+/g, "_") === raw
  );
  return match ? match.key : "sick_leave";
}

export function getStoredLeaveRecords() {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(LEAVE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLeaveRecords(records) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LEAVE_STORAGE_KEY, JSON.stringify(Array.isArray(records) ? records : []));
}

export function getRequestForParticipant(records, participantId) {
  return (records || []).filter((record) => String(record.participantId ?? "") === String(participantId));
}

export function calculateTypeBalance(records = [], participantId, typeKey) {
  const normalizedType = normalizeLeaveType(typeKey);
  const typeMetadata = LEAVE_TYPES.find((type) => type.key === normalizedType) || LEAVE_TYPES[0];
  const currentMonth = getLeaveMonthKey();

  const filtered = (records || []).filter((record) => {
    if (!record) return false;
    const recordType = normalizeLeaveType(record.leaveType);
    const participantMatch =
      String(record.participantId ?? "") === String(participantId) ||
      String(record.userId ?? "") === String(participantId) ||
      String(record.participant_id ?? "") === String(participantId);

    const recordMonth = getLeaveMonthKey(record.startDate || record.date || record.submittedAt);
    return recordType === normalizedType && participantMatch && recordMonth === currentMonth;
  });

  let approvedDays = 0;
  let pendingDays = 0;
  let adjustmentUsedDelta = 0;

  filtered.forEach((record) => {
    const days = Number(record.days) || 0;
    if (!days) return;

    const isAdjustment = Boolean(record.adjustmentType || record.isAdjustment);
    const status = String(record.status || "").toLowerCase();

    if (isAdjustment) {
      const type = String(record.adjustmentType || "ADD").toUpperCase();
      adjustmentUsedDelta += type === "DEDUCT" ? days : -days;
      return;
    }

    if (status === "approved") {
      approvedDays += days;
    } else if (status === "pending") {
      pendingDays += days;
    }
  });

  const allocation = typeMetadata.allocation;
  const used = Math.min(allocation, Math.max(0, approvedDays + adjustmentUsedDelta));
  const remaining = Math.min(allocation, Math.max(0, allocation - used));

  return {
    typeKey: normalizedType,
    label: typeMetadata.label,
    allocation,
    approved: approvedDays,
    pending: pendingDays,
    adjustment: adjustmentUsedDelta,
    used,
    remaining,
  };
}

export function getParticipantLeaveSummary(participant, records = []) {
  if (!participant) {
    return {
      participantId: null,
      participantName: "",
      organization: "",
      department: "",
      typeSummaries: LEAVE_TYPES.map((type) => ({
        ...calculateTypeBalance([], null, type.key),
        label: type.label,
      })),
      totalAllocation: 0,
      totalUsed: 0,
      totalPending: 0,
      totalRemaining: 0,
    };
  }

  const participantId = participant.id ?? participant.participantId ?? participant.participant_id ?? null;
  const userId = participant.userId ?? participant.user_id ?? participant.userID ?? null;
  const filtered = (records || []).filter((record) => {
    if (!record) return false;
    const matchesParticipant =
      (participantId != null && String(record.participantId ?? "") === String(participantId)) ||
      (userId != null && String(record.userId ?? "") === String(userId)) ||
      (participantId != null && String(record.participant_id ?? "") === String(participantId));
    return matchesParticipant;
  });

  const typeSummaries = LEAVE_TYPES.map((type) => ({
    ...calculateTypeBalance(filtered, participantId ?? userId ?? "", type.key),
    label: type.label,
  }));

  const totalAllocation = typeSummaries.reduce((sum, item) => sum + Number(item.allocation || 0), 0);
  const totalUsed = typeSummaries.reduce((sum, item) => sum + Number(item.approved || 0), 0);
  const totalPending = typeSummaries.reduce((sum, item) => sum + Number(item.pending || 0), 0);
  const totalRemaining = typeSummaries.reduce((sum, item) => sum + Number(item.remaining || 0), 0);

  return {
    participantId,
    participantName: [
      participant.firstName,
      participant.lastName,
      participant.middleName,
    ].filter(Boolean).join(" ") || participant.full_name || participant.name || "Participant",
    organization: participant.organizationName || participant.organization_name || participant.organization || participant.organizationId || "—",
    department: participant.department || participant.groupName || participant.section || participant.group_name || "—",
    typeSummaries,
    totalAllocation,
    totalUsed,
    totalPending,
    totalRemaining,
  };
}

export function getAllParticipantLeaveSummaries(participants, records = []) {
  return (participants || []).map((participant) => getParticipantLeaveSummary(participant, records));
}

export function getCurrentParticipantForUser(user, participants = []) {
  if (!user) return null;
  const userId = Number(user.id ?? user.userId ?? user.user_id ?? 0) || null;
  const email = String(user.email || "").trim().toLowerCase();

  return (participants || []).find((participant) => {
    const pId = Number(participant.userId ?? participant.user_id ?? participant.userID ?? 0) || null;
    const pEmail = String(participant.email || "").trim().toLowerCase();
    const matchesUser = userId != null && pId != null && userId === pId;
    const matchesEmail = email && pEmail && email === pEmail;
    return matchesUser || matchesEmail;
  }) || null;
}

export function getLeaveRequests(records = []) {
  return (records || []).filter((record) => String(record.status || "").toLowerCase() === "pending");
}

export function addManualAdjustment({ participantId, userId, organizationId, leaveType, days, date, reason, adjustmentType = "ADD" }) {
  const trimmedDays = Number(days) || 0;
  if (!participantId || !leaveType || trimmedDays <= 0) {
    throw new Error("Participant, leave type, and valid days are required.");
  }

  const existing = getStoredLeaveRecords();
  const nextRecord = {
    id: `leave-adjustment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    participantId: Number(participantId),
    userId: userId != null ? Number(userId) : null,
    organizationId: organizationId != null ? Number(organizationId) : null,
    leaveType: normalizeLeaveType(leaveType),
    startDate: date || new Date().toISOString().slice(0, 10),
    endDate: date || new Date().toISOString().slice(0, 10),
    days: trimmedDays,
    reason: reason || "Manual adjustment",
    status: "approved",
    submittedAt: new Date().toISOString(),
    reviewedAt: new Date().toISOString(),
    reviewedBy: userId != null ? Number(userId) : null,
    adjustmentType: String(adjustmentType || "ADD").toUpperCase(),
    adjustmentNote: reason || "Manual adjustment",
    isAdjustment: true,
  };

  const nextRecords = [nextRecord, ...existing];
  saveLeaveRecords(nextRecords);
  return nextRecord;
}

export function addLeaveRequest({ participantId, userId, organizationId, leaveType, startDate, endDate, days, reason, status = "pending" }) {
  const cleanedDays = Number(days) || 0;
  if (!participantId || !leaveType || cleanedDays <= 0) {
    throw new Error("Participant, leave type, and valid days are required.");
  }

  const normalizedStart = String(startDate || "").trim();
  const normalizedEnd = String(endDate || "").trim();
  if (!normalizedStart || !normalizedEnd) {
    throw new Error("Start and end dates are required.");
  }

  if (new Date(normalizedEnd) < new Date(normalizedStart)) {
    throw new Error("End date cannot be before start date.");
  }

  const typeMetadata = getLeaveTypeByKey(leaveType);
  if (cleanedDays > typeMetadata.maxDaysPerRequest) {
    throw new Error(`${typeMetadata.label} requests are limited to ${typeMetadata.maxDaysPerRequest} days.`);
  }

  const records = getStoredLeaveRecords();
  const balance = calculateTypeBalance(records, participantId, typeMetadata.key);
  if (cleanedDays > balance.remaining) {
    throw new Error(`Only ${balance.remaining} ${typeMetadata.label} days remain.`);
  }
  const start = new Date(normalizedStart).getTime();
  const end = new Date(normalizedEnd).getTime();
  const overlapsExisting = records.some((record) => {
    if (record.isAdjustment || String(record.status).toLowerCase() === "rejected") return false;
    if (String(record.participantId ?? "") !== String(participantId)) return false;
    const existingStart = new Date(record.startDate).getTime();
    const existingEnd = new Date(record.endDate || record.startDate).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(existingStart) && Number.isFinite(existingEnd) && start <= existingEnd && end >= existingStart;
  });
  if (overlapsExisting) throw new Error("This leave request overlaps an existing request.");

  const nextRecord = {
    id: `leave-request-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    participantId: Number(participantId),
    userId: userId != null ? Number(userId) : null,
    organizationId: organizationId != null ? Number(organizationId) : null,
    leaveType: normalizeLeaveType(leaveType),
    startDate: normalizedStart,
    endDate: normalizedEnd,
    days: cleanedDays,
    reason: reason || "Leave request",
    status: String(status || "pending").toLowerCase(),
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    adjustmentType: null,
    adjustmentNote: null,
    isAdjustment: false,
  };

  const nextRecords = [nextRecord, ...records];
  saveLeaveRecords(nextRecords);
  return nextRecord;
}

export function updateLeaveRequestStatus(recordId, status, reviewedBy) {
  const records = getStoredLeaveRecords();
  const nextRecords = records.map((record) => {
    if (String(record.id) !== String(recordId)) return record;
    return {
      ...record,
      status: String(status || "pending").toLowerCase(),
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewedBy != null ? Number(reviewedBy) : record.reviewedBy,
    };
  });

  saveLeaveRecords(nextRecords);
  return nextRecords;
}

export function getStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return "success";
  if (normalized === "pending") return "warning";
  if (normalized === "rejected") return "danger";
  return "muted";
}

export function getLowBalanceTone(remaining, total) {
  if (!total) return "muted";
  const ratio = remaining / total;
  if (ratio <= 0) return "danger";
  if (ratio <= 0.2) return "warning";
  return "success";
}

export function getLeaveTypeByKey(typeKey) {
  return LEAVE_TYPES.find((type) => type.key === normalizeLeaveType(typeKey)) || LEAVE_TYPES[0];
}

export function getLeaveSummaryForCurrentUser(user, participants, records = []) {
  const participant = getCurrentParticipantForUser(user, participants);
  return participant ? getParticipantLeaveSummary(participant, records) : { participantId: null, participantName: user?.full_name || "Viewer", totalAllocation: 0, totalUsed: 0, totalPending: 0, totalRemaining: 0, typeSummaries: LEAVE_TYPES.map((type) => ({ ...calculateTypeBalance([], null, type.key), label: type.label })) };
}
