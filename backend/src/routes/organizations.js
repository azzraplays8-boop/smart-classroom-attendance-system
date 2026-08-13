/**
 * Organizations & Invitation Code Management Routes
 *
 * Protected by Super Admin role (authorize("super_admin")).
 *
 * GET    /organizations            - List all organizations (+ member counts)
 * POST   /organizations            - Create an organization
 * GET    /organizations/:id        - Get a single organization
 * PUT    /organizations/:id        - Update an organization
 * DELETE /organizations/:id        - Delete (archive) an organization
 * GET    /organizations/:id/codes  - List invitation codes for an org
 * POST   /organizations/:id/codes  - Generate a new invitation code
 * PUT    /organizations/codes/:codeId - Update invitation code (status/max_uses/expiry)
 * DELETE /organizations/codes/:codeId - Delete an invitation code
 * GET    /organizations/:id/members - List organization members
 */
import express from "express";
import crypto from "crypto";
import { authenticate, authorize } from "../auth/authMiddleware.js";

function generateOrgCode(name) {
  // e.g. "BSIT Org 2026" -> "ORG-BSITORG2026"
  const base = String(name || "ORG")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  return `ORG-${base || "ORG"}`;
}

function generateInvitationCode() {
  // 8-char alphanumeric uppercase, e.g. "XC4K9Q2M"
  return crypto
    .randomBytes(5)
    .toString("base64")
    .replace(/[^A-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8) || "INVITE";
}

export default function organizationsRouter({ pool }) {
  const router = express.Router();

  // Apply auth + super_admin to all org routes
  router.use(authenticate(pool), authorize("super_admin"));

  // ── GET /organizations ────────────────────────────────
  router.get("/", async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT o.id, o.name, o.department, o.description, o.org_code AS orgCode,
                o.status, o.created_by AS createdBy, o.created_at AS createdAt,
                o.updated_at AS updatedAt,
                (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = o.id) AS memberCount,
                (SELECT COUNT(*) FROM organization_invitation_codes ic WHERE ic.organization_id = o.id AND ic.status = 'active') AS activeCodeCount
           FROM organizations o
          ORDER BY o.created_at DESC`
      );
      return res.json({ organizations: rows });
    } catch (err) {
      console.error("GET /organizations error:", err);
      return res.status(500).json({ message: "Failed to fetch organizations." });
    }
  });

  // ── POST /organizations ───────────────────────────────
  router.post("/", async (req, res) => {
    try {
      const { name, department, description, org_code } = req.body;

      if (!name || !String(name).trim()) {
        return res.status(400).json({ message: "Organization name is required." });
      }

      const normalizedName = String(name).trim();
      const orgCode = (org_code && String(org_code).trim()) || generateOrgCode(normalizedName);

      // Check unique name
      const [existing] = await pool.query("SELECT id FROM organizations WHERE name = ?", [normalizedName]);
      if (existing.length > 0) {
        return res.status(409).json({ message: "An organization with this name already exists." });
      }

      const [result] = await pool.query(
        `INSERT INTO organizations (name, department, description, org_code, status, created_by)
         VALUES (?, ?, ?, ?, 'active', ?)`,
        [normalizedName, department ? String(department).trim() : null,
         description ? String(description).trim() : null, orgCode, req.user.id]
      );

      return res.status(201).json({
        message: "Organization created successfully.",
        organization: { id: result.insertId, name: normalizedName, org_code: orgCode },
      });
    } catch (err) {
      console.error("POST /organizations error:", err);
      return res.status(500).json({ message: "Failed to create organization." });
    }
  });

  // ── GET /organizations/:id ────────────────────────────
  router.get("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query(
        `SELECT o.id, o.name, o.department, o.description, o.org_code AS orgCode,
                o.status, o.created_by AS createdBy, o.created_at AS createdAt,
                o.updated_at AS updatedAt
           FROM organizations o
          WHERE o.id = ?`,
        [id]
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Organization not found." });
      }
      return res.json({ organization: rows[0] });
    } catch (err) {
      console.error("GET /organizations/:id error:", err);
      return res.status(500).json({ message: "Failed to fetch organization." });
    }
  });

  // ── PUT /organizations/:id ────────────────────────────
  router.put("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, department, description, org_code, status } = req.body;

      const [existing] = await pool.query("SELECT id FROM organizations WHERE id = ?", [id]);
      if (existing.length === 0) {
        return res.status(404).json({ message: "Organization not found." });
      }

      const updates = [];
      const params = [];

      if (name !== undefined) {
        if (!String(name).trim()) {
          return res.status(400).json({ message: "Organization name cannot be empty." });
        }
        updates.push("name = ?");
        params.push(String(name).trim());
      }
      if (department !== undefined) {
        updates.push("department = ?");
        params.push(department ? String(department).trim() : null);
      }
      if (description !== undefined) {
        updates.push("description = ?");
        params.push(description ? String(description).trim() : null);
      }
      if (org_code !== undefined) {
        updates.push("org_code = ?");
        params.push(org_code ? String(org_code).trim() : null);
      }
      if (status !== undefined) {
        if (!["active", "archived"].includes(status)) {
          return res.status(400).json({ message: "Status must be 'active' or 'archived'." });
        }
        updates.push("status = ?");
        params.push(status);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: "No fields to update." });
      }

      params.push(id);
      await pool.query(`UPDATE organizations SET ${updates.join(", ")} WHERE id = ?`, params);

      return res.json({ message: "Organization updated successfully." });
    } catch (err) {
      console.error("PUT /organizations/:id error:", err);
      return res.status(500).json({ message: "Failed to update organization." });
    }
  });

  // ── DELETE /organizations/:id ─────────────────────────
  router.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);

      const [existing] = await pool.query("SELECT id FROM organizations WHERE id = ?", [id]);
      if (existing.length === 0) {
        return res.status(404).json({ message: "Organization not found." });
      }

      // Archive instead of hard delete to preserve data
      await pool.query("UPDATE organizations SET status = 'archived' WHERE id = ?", [id]);

      return res.json({ message: "Organization archived successfully." });
    } catch (err) {
      console.error("DELETE /organizations/:id error:", err);
      return res.status(500).json({ message: "Failed to archive organization." });
    }
  });

  // ── GET /organizations/:id/codes ──────────────────────
  router.get("/:id/codes", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query(
        `SELECT ic.id, ic.organization_id AS organizationId, ic.code, ic.expires_at AS expiresAt,
                ic.max_uses AS maxUses, ic.used_count AS usedCount, ic.status,
                ic.created_by AS createdBy, ic.created_at AS createdAt
           FROM organization_invitation_codes ic
          WHERE ic.organization_id = ?
          ORDER BY ic.created_at DESC`,
        [id]
      );
      return res.json({ codes: rows });
    } catch (err) {
      console.error("GET /organizations/:id/codes error:", err);
      return res.status(500).json({ message: "Failed to fetch invitation codes." });
    }
  });

  // ── POST /organizations/:id/codes ─────────────────────
  router.post("/:id/codes", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { code, expires_at, max_uses } = req.body;

      const [org] = await pool.query("SELECT id FROM organizations WHERE id = ?", [id]);
      if (!org || org.length === 0) {
        return res.status(404).json({ message: "Organization not found." });
      }

      const inviteCode = (code && String(code).toUpperCase().trim()) || generateInvitationCode();

      // Check uniqueness
      const [dup] = await pool.query("SELECT id FROM organization_invitation_codes WHERE code = ?", [inviteCode]);
      if (dup.length > 0) {
        return res.status(409).json({ message: "This invitation code already exists." });
      }

      const maxUses = Number(max_uses) > 0 ? Number(max_uses) : 0;
      const expiresAt = expires_at ? new Date(expires_at) : null;

      const [result] = await pool.query(
        `INSERT INTO organization_invitation_codes
           (organization_id, code, expires_at, max_uses, used_count, status, created_by)
         VALUES (?, ?, ?, ?, 0, 'active', ?)`,
        [id, inviteCode, expiresAt, maxUses, req.user.id]
      );

      return res.status(201).json({
        message: "Invitation code generated successfully.",
        code: {
          id: result.insertId,
          organizationId: id,
          code: inviteCode,
          expiresAt,
          maxUses,
          usedCount: 0,
          status: "active",
        },
      });
    } catch (err) {
      console.error("POST /organizations/:id/codes error:", err);
      return res.status(500).json({ message: "Failed to generate invitation code." });
    }
  });

  // ── PUT /organizations/codes/:codeId ──────────────────
  router.put("/codes/:codeId", async (req, res) => {
    try {
      const codeId = Number(req.params.codeId);
      const { status, max_uses, expires_at } = req.body;

      const [existing] = await pool.query("SELECT id FROM organization_invitation_codes WHERE id = ?", [codeId]);
      if (existing.length === 0) {
        return res.status(404).json({ message: "Invitation code not found." });
      }

      const updates = [];
      const params = [];

      if (status !== undefined) {
        if (!["active", "disabled"].includes(status)) {
          return res.status(400).json({ message: "Status must be 'active' or 'disabled'." });
        }
        updates.push("status = ?");
        params.push(status);
      }
      if (max_uses !== undefined) {
        updates.push("max_uses = ?");
        params.push(Number(max_uses) > 0 ? Number(max_uses) : 0);
      }
      if (expires_at !== undefined) {
        updates.push("expires_at = ?");
        params.push(expires_at ? new Date(expires_at) : null);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: "No fields to update." });
      }

      params.push(codeId);
      await pool.query(`UPDATE organization_invitation_codes SET ${updates.join(", ")} WHERE id = ?`, params);

      return res.json({ message: "Invitation code updated successfully." });
    } catch (err) {
      console.error("PUT /organizations/codes/:codeId error:", err);
      return res.status(500).json({ message: "Failed to update invitation code." });
    }
  });

  // ── DELETE /organizations/codes/:codeId ────────────────
  router.delete("/codes/:codeId", async (req, res) => {
    try {
      const codeId = Number(req.params.codeId);
      const [result] = await pool.query("DELETE FROM organization_invitation_codes WHERE id = ?", [codeId]);
      if (!result.affectedRows) {
        return res.status(404).json({ message: "Invitation code not found." });
      }
      return res.json({ message: "Invitation code deleted successfully." });
    } catch (err) {
      console.error("DELETE /organizations/codes/:codeId error:", err);
      return res.status(500).json({ message: "Failed to delete invitation code." });
    }
  });

  // ── GET /organizations/:id/members ────────────────────
  router.get("/:id/members", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query(
        `SELECT u.id, u.full_name, u.email, u.username, u.role, u.is_active,
                u.account_status, m.role AS member_role, m.status AS member_status,
                m.joined_at AS joinedAt
           FROM organization_members m
           INNER JOIN users u ON u.id = m.user_id
          WHERE m.organization_id = ?
          ORDER BY m.joined_at DESC`,
        [id]
      );
      return res.json({ members: rows });
    } catch (err) {
      console.error("GET /organizations/:id/members error:", err);
      return res.status(500).json({ message: "Failed to fetch organization members." });
    }
  });

  return router;
}
