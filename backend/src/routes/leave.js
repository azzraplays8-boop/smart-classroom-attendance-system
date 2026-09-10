import express from "express";
import { authenticate, authorize } from "../auth/authMiddleware.js";
import { isValidEmail, sendLeaveDecisionEmail, sendPendingLeaveRequestEmail } from "../services/emailService.js";

const TYPES = new Map([
  ["sick_leave", 5], ["personal_leave", 3], ["emergency_leave", 3],
  ["mental_health_leave", 3], ["academic_leave", 5],
]);
const normalizeRole = (role) => String(role || "").toLowerCase();
const normalizeStatus = (status) => String(status || "").trim().toLowerCase();
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

export default function leaveRouter({ pool }) {
  const router = express.Router();
  router.use(authenticate(pool));

  router.get("/", async (req, res) => {
    const role = normalizeRole(req.user.role);
    const ownOnly = role === "viewer" || role === "teacher";
    const [rows] = await pool.query(`SELECT lr.*, u.full_name AS requester_name, u.role AS requester_role, p.participant_identifier, p.department, p.group_name AS groupName FROM leave_requests lr JOIN users u ON u.id = lr.requester_id LEFT JOIN participants p ON p.id = lr.participant_id WHERE ${ownOnly ? "lr.requester_id = ?" : "1=1"} ORDER BY lr.submitted_at DESC`, ownOnly ? [req.user.id] : []);
    res.json({ requests: rows.map(displayRow) });
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
