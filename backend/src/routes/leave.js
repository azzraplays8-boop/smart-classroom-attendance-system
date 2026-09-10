import express from "express";
import { authenticate, authorize } from "../auth/authMiddleware.js";
import { isValidEmail, sendLeaveDecisionEmail, sendPendingLeaveRequestEmail } from "../services/emailService.js";

const TYPES = new Map([
  ["sick_leave", 5], ["personal_leave", 3], ["emergency_leave", 3],
  ["mental_health_leave", 3], ["academic_leave", 5],
]);
const normalizeRole = (role) => String(role || "").toLowerCase();
const normalizeStatus = (status) => String(status || "").trim().toLowerCase();
const normalizeAdjustmentType = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "DEDUCT" ? "DEDUCT" : "ADD";
};
const frontendUrl = () => String(process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "").split(",")[0].trim().replace(/\/$/, "");

function canReview(requesterRole, reviewerRole) {
  const requester = normalizeRole(requesterRole);
  const reviewer = normalizeRole(reviewerRole);
  if (requester === "viewer" || requester === "teacher") return reviewer === "administrator" || reviewer === "super_admin";
  if (requester === "administrator") return reviewer === "super_admin";
  return false;
}

function displayRow(row) {
  return {
    ...row,
    participantId: row.participantId ?? row.participant_id,
    participantIdentifier: row.participantIdentifier ?? row.participant_identifier,
    requesterId: row.requesterId ?? row.requester_id,
    requesterName: row.requesterName ?? row.requester_name,
    requesterRole: row.requesterRole ?? row.requester_role,
    organizationId: row.organizationId ?? row.organization_id,
    leaveType: row.leaveType ?? row.leave_type,
    startDate: row.startDate ?? row.start_date,
    endDate: row.endDate ?? row.end_date,
    status: normalizeStatus(row.status),
    submittedAt: row.submittedAt ?? row.submitted_at,
    reviewedAt: row.reviewedAt ?? row.reviewed_at,
    reviewedBy: row.reviewedBy ?? row.reviewed_by,
    rejectionReason: row.rejectionReason ?? row.rejection_reason,
    groupName: row.groupName ?? row.group_name,
    department: row.department || row.groupName || row.group_name || "-",
  };
}

function displayAdjustmentRow(row) {
  return {
    ...row,
    id: row.id,
    participantId: row.participantId ?? row.participant_id,
    participantIdentifier: row.participantIdentifier ?? row.participant_identifier,
    leaveType: row.leaveType ?? row.leave_type,
    days: Number(row.days ?? 0),
    adjustmentType: normalizeAdjustmentType(row.adjustmentType ?? row.adjustment_type),
    reason: row.reason || row.adjustment_note || "Manual adjustment",
    adjustedBy: row.adjustedBy ?? row.adjusted_by,
    adjustedByName: row.adjustedByName ?? row.adjusted_by_name,
    adjustedAt: row.adjustedAt ?? row.adjusted_at,
    organizationId: row.organizationId ?? row.organization_id,
    isAdjustment: true,
  };
}

function getSignedAdjustmentValue(row) {
  if (row == null) return 0;

  const signedValue = row.signed_change ?? row.signedChange ?? row.adjustment_value ?? row.adjustmentValue ?? row.change ?? null;
  if (signedValue !== null && signedValue !== undefined && signedValue !== "") {
    const numericSignedValue = Number(signedValue);
    if (Number.isFinite(numericSignedValue)) {
      return numericSignedValue;
    }
  }

  const normalizedAdjustmentType = normalizeAdjustmentType(row.adjustmentType ?? row.adjustment_type);
  const days = Number(row.days ?? row.adjustment_days ?? 0);
  if (!Number.isFinite(days) || days <= 0) return 0;

  return normalizedAdjustmentType === "DEDUCT" ? -days : days;
}

function buildBalanceSummaryRows(participantRows, approvedRows, adjustmentRows, pendingRows) {
  const approvedByKey = new Map();
  const adjustmentByKey = new Map();
  const pendingByKey = new Map();

  for (const row of approvedRows || []) {
    const key = `${Number(row.participant_id ?? row.participantId ?? 0)}|${String(row.leave_type ?? row.leaveType ?? "")}`;
    approvedByKey.set(key, Number(row.used_days ?? row.days ?? 0));
  }

  for (const row of adjustmentRows || []) {
    const key = `${Number(row.participant_id ?? row.participantId ?? 0)}|${String(row.leave_type ?? row.leaveType ?? "")}`;
    adjustmentByKey.set(key, Number(row.net_adjustment ?? getSignedAdjustmentValue(row) ?? 0));
  }

  for (const row of pendingRows || []) {
    const key = `${Number(row.participant_id ?? row.participantId ?? 0)}|${String(row.leave_type ?? row.leaveType ?? "")}`;
    pendingByKey.set(key, Number(row.pending_days ?? row.days ?? 0));
  }

  return participantRows.map((participant) => {
    const participantId = Number(participant.id ?? participant.participantId ?? participant.participant_id ?? 0);
    const typeSummaries = Array.from(TYPES.entries()).map(([leaveType, allocation]) => {
      const approvedUsed = Number(approvedByKey.get(`${participantId}|${leaveType}`) || 0);
      const netAdjustment = Number(adjustmentByKey.get(`${participantId}|${leaveType}`) || 0);
      const pendingDays = Number(pendingByKey.get(`${participantId}|${leaveType}`) || 0);
      const currentBalance = Math.max(0, allocation + netAdjustment - approvedUsed);

      return {
        typeKey: leaveType,
        label: leaveType.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()),
        allocation,
        approved: approvedUsed,
        pending: pendingDays,
        adjustment: netAdjustment,
        used: approvedUsed,
        remaining: currentBalance,
      };
    });

    const totalAllocation = typeSummaries.reduce((sum, item) => sum + Number(item.allocation || 0), 0);
    const totalUsed = typeSummaries.reduce((sum, item) => sum + Number(item.approved || 0), 0);
    const totalPending = typeSummaries.reduce((sum, item) => sum + Number(item.pending || 0), 0);
    const totalRemaining = typeSummaries.reduce((sum, item) => sum + Number(item.remaining || 0), 0);

    return {
      participantId,
      participantIdentifier: participant.participant_identifier ?? participant.participantIdentifier ?? participant.studentNumber ?? null,
      participantName: participant.full_name || participant.fullName || participant.name || "Participant",
      organization: participant.organization_name || participant.organizationName || participant.organization || participant.organizationId || "—",
      department: participant.department || participant.groupName || participant.group_name || participant.section || "—",
      typeSummaries,
      totalAllocation,
      totalUsed,
      totalPending,
      totalRemaining,
    };
  });
}

export default function leaveRouter({ pool }) {
  const router = express.Router();
  router.use(authenticate(pool));

  router.get("/", async (req, res) => {
    const role = normalizeRole(req.user.role);
    const ownOnly = role === "viewer" || role === "teacher";
    const [rows] = await pool.query(`SELECT lr.*, u.full_name AS requester_name, u.role AS requester_role, p.participant_identifier, p.department, p.group_name AS groupName FROM leave_requests lr JOIN users u ON u.id = lr.requester_id LEFT JOIN participants p ON p.id = lr.participant_id WHERE ${ownOnly ? "lr.requester_id = ?" : "1=1"} ORDER BY lr.submitted_at DESC`, ownOnly ? [req.user.id] : []);
    res.json({ requests: rows.map(displayRow) });
  });

  router.get("/balances", async (req, res) => {
    const [participantRows] = await pool.query(`
      SELECT p.id, p.participant_identifier, p.department, p.group_name AS groupName,
             p.organization_id, p.full_name,
             o.name AS organization_name
      FROM participants p
      LEFT JOIN organizations o ON o.id = p.organization_id
      ORDER BY p.participant_identifier ASC
    `);

    const [approvedRows] = await pool.query(`
      SELECT participant_id, leave_type, SUM(days) AS used_days
      FROM leave_requests
      WHERE status = 'approved'
      GROUP BY participant_id, leave_type
    `);

    const [pendingRows] = await pool.query(`
      SELECT participant_id, leave_type, SUM(days) AS pending_days
      FROM leave_requests
      WHERE status = 'pending'
      GROUP BY participant_id, leave_type
    `);

    const [adjustmentRows] = await pool.query(`
      SELECT participant_id, leave_type,
             SUM(CASE
               WHEN adjustment_type = 'ADD' THEN days
               WHEN adjustment_type = 'DEDUCT' THEN -days
               ELSE 0
             END) AS net_adjustment
      FROM leave_adjustments
      GROUP BY participant_id, leave_type
    `);

    const balances = buildBalanceSummaryRows(participantRows, approvedRows, adjustmentRows, pendingRows);
    const totalRemaining = balances.reduce((sum, item) => sum + Number(item.totalRemaining || 0), 0);

    res.json({
      balances,
      totalRemaining,
      remainingLeaveDays: totalRemaining,
      totalParticipants: balances.length,
    });
  });

  router.get("/adjustments", async (req, res) => {
    if (req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Only Super Admin can view leave balance adjustments." });
    }

    const [rows] = await pool.query(`
      SELECT la.*, p.participant_identifier, u.full_name AS adjusted_by_name
      FROM leave_adjustments la
      LEFT JOIN participants p ON p.id = la.participant_id
      LEFT JOIN users u ON u.id = la.adjusted_by
      ORDER BY la.adjusted_at DESC
    `);

    res.json({ adjustments: rows.map(displayAdjustmentRow) });
  });

  router.post("/adjustments", async (req, res) => {
    if (req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Only Super Admin can manually adjust leave balances." });
    }

    const { participantId, leaveType, days, adjustmentType, reason } = req.body || {};
    const normalizedLeaveType = String(leaveType || "").trim().toLowerCase();
    const numericDays = Number(days);
    const normalizedAdjustmentType = normalizeAdjustmentType(adjustmentType);
    const trimmedReason = String(reason || "").trim();

    if (!participantId) return res.status(400).json({ message: "Participant is required." });
    if (!TYPES.has(normalizedLeaveType)) return res.status(400).json({ message: "Valid leave type is required." });
    if (!Number.isInteger(numericDays) || numericDays <= 0) return res.status(400).json({ message: "Number of days must be a positive whole number." });
    if (!['ADD', 'DEDUCT'].includes(normalizedAdjustmentType)) return res.status(400).json({ message: "Adjustment type must be ADD or DEDUCT." });
    if (!trimmedReason) return res.status(400).json({ message: "Reason / adjustment note is required." });

    const [participantRows] = await pool.query(
      "SELECT id, participant_identifier AS participantIdentifier, department, group_name AS groupName FROM participants WHERE id = ? LIMIT 1",
      [participantId]
    );
    const participant = participantRows[0];
    if (!participant) return res.status(400).json({ message: "Participant record not found." });

    const allocation = Number(TYPES.get(normalizedLeaveType) || 0);
    const [usedRows] = await pool.query(
      "SELECT COALESCE(SUM(days), 0) AS used_days FROM leave_requests WHERE participant_id = ? AND leave_type = ? AND status = 'approved'",
      [participant.id, normalizedLeaveType]
    );
    const [adjustmentRows] = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN adjustment_type = 'ADD' THEN days WHEN adjustment_type = 'DEDUCT' THEN -days ELSE 0 END), 0) AS net_adjustment FROM leave_adjustments WHERE participant_id = ? AND leave_type = ?",
      [participant.id, normalizedLeaveType]
    );

    const approvedUsed = Number(usedRows[0]?.used_days || 0);
    const netAdjustment = Number(adjustmentRows[0]?.net_adjustment || 0);
    const currentBalance = Math.max(0, allocation - approvedUsed + netAdjustment);
    const projectedBalance = normalizedAdjustmentType === "DEDUCT"
      ? currentBalance - numericDays
      : currentBalance + numericDays;

    if (normalizedAdjustmentType === "DEDUCT" && projectedBalance < 0) {
      return res.status(400).json({ message: "Deduction would make the leave balance below zero." });
    }

    if (normalizedAdjustmentType === "ADD" && projectedBalance > allocation) {
      return res.status(400).json({ message: `This adjustment would exceed the ${allocation}-day allocation for ${normalizedLeaveType.replace(/_/g, " ")}.` });
    }

    const [result] = await pool.query(
      "INSERT INTO leave_adjustments (participant_id, organization_id, leave_type, days, adjustment_type, reason, adjusted_by, adjusted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
      [participant.id, req.user.organization_id ?? null, normalizedLeaveType, numericDays, normalizedAdjustmentType, trimmedReason, req.user.id]
    );

    const [savedRows] = await pool.query(`
      SELECT la.*, p.participant_identifier, u.full_name AS adjusted_by_name
      FROM leave_adjustments la
      LEFT JOIN participants p ON p.id = la.participant_id
      LEFT JOIN users u ON u.id = la.adjusted_by
      WHERE la.id = ? LIMIT 1
    `, [result.insertId]);

    const adjustment = displayAdjustmentRow(savedRows[0]);
    const newBalance = normalizedAdjustmentType === "DEDUCT"
      ? Math.max(0, currentBalance - numericDays)
      : Math.min(allocation, currentBalance + numericDays);

    res.status(201).json({
      adjustment,
      currentBalance,
      newBalance,
      message: "Leave balance adjusted successfully.",
    });
  });

  router.post("/", async (req, res) => {
    const { participantId, leaveType, startDate, endDate, days, reason } = req.body || {};
    const type = String(leaveType || "").toLowerCase();
    const numericDays = Number(days);
    if (!TYPES.has(type) || !startDate || !endDate || !Number.isFinite(numericDays) || numericDays <= 0 || numericDays > TYPES.get(type)) return res.status(400).json({ message: "Valid leave type, dates, and days are required." });
    if (new Date(endDate) < new Date(startDate)) return res.status(400).json({ message: "End date cannot be before start date." });
    const [participantRows] = await pool.query("SELECT id, department, group_name AS groupName, participant_identifier AS participantIdentifier FROM participants WHERE id = ? LIMIT 1", [participantId || null]);
    const participant = participantRows[0];
    if (!participant) return res.status(400).json({ message: "Participant record not found." });
    const participantOrganizationId = req.user?.organization_id ?? null;
    const [result] = await pool.query("INSERT INTO leave_requests (participant_id, requester_id, requester_role, organization_id, leave_type, start_date, end_date, days, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [participant.id, req.user.id, req.user.role, participantOrganizationId, type, startDate, endDate, numericDays, String(reason || "Leave request").trim()]);
    const [rows] = await pool.query(`SELECT lr.*, u.full_name AS requester_name, u.role AS requester_role, p.participant_identifier, p.department, p.group_name AS groupName FROM leave_requests lr JOIN users u ON u.id = lr.requester_id LEFT JOIN participants p ON p.id = lr.participant_id WHERE lr.id = ?`, [result.insertId]);
    const request = displayRow(rows[0]);
    const requesterRole = normalizeRole(req.user.role);
    const approverRoles = requesterRole === "administrator" ? ["super_admin"] : requesterRole === "super_admin" ? [] : ["administrator", "super_admin"];
    const [recipients] = await pool.query("SELECT email FROM users WHERE is_active = 1 AND (account_status IS NULL OR account_status = 'approved') AND role IN (?) AND email IS NOT NULL AND email <> ''", [approverRoles]);
    const uniqueEmails = [...new Set(recipients.map((item) => String(item.email).trim().toLowerCase()).filter(isValidEmail))];
    const data = { requesterName: request.requesterName, participantId: request.participantIdentifier || request.participantId, requesterRole: request.requesterRole, department: request.department || request.groupName, leaveType: request.leaveType, startDate: request.startDate, endDate: request.endDate, days: request.days, reason: request.reason, submittedAt: request.submittedAt };
    await Promise.all(uniqueEmails.map((to) => sendPendingLeaveRequestEmail({ to, data, reviewUrl: frontendUrl() ? `${frontendUrl()}/leave-management` : "" })));
    res.status(201).json({ request });
  });

  router.patch("/:id/cancel", async (req, res) => {
    const [rows] = await pool.query(`SELECT lr.*, u.full_name AS requester_name, u.email AS requester_email, u.role AS requester_role, p.participant_identifier, p.department, p.group_name AS groupName FROM leave_requests lr JOIN users u ON u.id = lr.requester_id LEFT JOIN participants p ON p.id = lr.participant_id WHERE lr.id = ? LIMIT 1`, [req.params.id]);
    const request = rows[0];
    if (!request) return res.status(404).json({ message: "Leave request not found." });
    if (Number(request.requester_id) !== Number(req.user.id)) return res.status(403).json({ message: "You do not own this leave request." });
    if (normalizeStatus(request.status) !== "pending") return res.status(409).json({ message: "Only pending requests can be cancelled." });

    const [result] = await pool.query(
      "UPDATE leave_requests SET status = 'cancelled', reviewed_by = ?, reviewed_at = NOW() WHERE id = ? AND status = 'pending'",
      [req.user.id, req.params.id]
    );
    if (!result || Number(result.affectedRows || 0) === 0) {
      return res.status(409).json({ message: "This leave request is no longer pending and cannot be cancelled." });
    }

    const [updatedRows] = await pool.query(`SELECT lr.*, u.full_name AS requester_name, u.email AS requester_email, u.role AS requester_role, p.participant_identifier, p.department, p.group_name AS groupName FROM leave_requests lr JOIN users u ON u.id = lr.requester_id LEFT JOIN participants p ON p.id = lr.participant_id WHERE lr.id = ? LIMIT 1`, [req.params.id]);
    const updatedRequest = displayRow(updatedRows[0]);

    const requesterRole = normalizeRole(req.user.role);
    const approverRoles = requesterRole === "administrator" ? ["super_admin"] : requesterRole === "super_admin" ? [] : ["administrator", "super_admin"];
    if (approverRoles.length > 0) {
      const [recipients] = await pool.query("SELECT email FROM users WHERE is_active = 1 AND (account_status IS NULL OR account_status = 'approved') AND role IN (?) AND email IS NOT NULL AND email <> ''", [approverRoles]);
      const uniqueEmails = [...new Set(recipients.map((item) => String(item.email).trim().toLowerCase()).filter(isValidEmail))];
      const data = { requesterName: updatedRequest.requesterName, participantId: updatedRequest.participantIdentifier || updatedRequest.participantId, requesterRole: updatedRequest.requesterRole, department: updatedRequest.department || updatedRequest.groupName, leaveType: updatedRequest.leaveType, startDate: updatedRequest.startDate, endDate: updatedRequest.endDate, days: updatedRequest.days, reason: updatedRequest.reason, submittedAt: updatedRequest.submittedAt, approver: req.user.full_name };
      await Promise.all(uniqueEmails.map((to) => sendLeaveDecisionEmail({ to, data, status: "cancelled", intro: "A leave request has been cancelled and removed from the approval queue." })));
    }

    res.json({ request: updatedRequest, status: "cancelled", message: "Leave request cancelled." });
  });

  router.patch("/:id", async (req, res) => {
    const status = normalizeStatus(req.body?.status || "");
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ message: "Status must be approved or rejected." });
    const [rows] = await pool.query(`SELECT lr.*, u.full_name AS requester_name, u.email AS requester_email, u.role AS requester_role, p.participant_identifier, p.department, p.group_name AS groupName FROM leave_requests lr JOIN users u ON u.id = lr.requester_id LEFT JOIN participants p ON p.id = lr.participant_id WHERE lr.id = ? LIMIT 1`, [req.params.id]);
    const request = rows[0];
    if (!request) return res.status(404).json({ message: "Leave request not found." });
    if (normalizeStatus(request.status) !== "pending") return res.status(409).json({ message: "Only pending requests can be reviewed." });
    if (!canReview(request.requester_role, req.user.role) || Number(request.requester_id) === Number(req.user.id)) return res.status(403).json({ message: "You are not authorized to review this leave request." });
    await pool.query("UPDATE leave_requests SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ? AND status = 'pending'", [status, status === "rejected" ? String(req.body?.rejectionReason || req.body?.comment || "").trim() || null : null, req.user.id, req.params.id]);
    const data = { requesterName: request.requester_name, participantId: request.participant_identifier || request.participant_id, requesterRole: request.requester_role, department: request.department || request.groupName, leaveType: request.leave_type, startDate: request.start_date, endDate: request.end_date, days: request.days, reason: request.reason, submittedAt: request.submitted_at, approver: req.user.full_name, rejectionReason: status === "rejected" ? String(req.body?.rejectionReason || req.body?.comment || "").trim() : "" };
    await sendLeaveDecisionEmail({ to: request.requester_email, data, status });
    res.json({ status, message: `Leave request ${status}.` });
  });

  return router;
}
