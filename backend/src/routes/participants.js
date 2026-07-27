import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function participantsRouter({ pool, upload }) {
  const router = express.Router();

  // GET /participants
  router.get("/", async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT
          id,
          participant_identifier AS participantIdentifier,
          qr_code AS qrCode,
          photo,
          last_name AS lastName,
          first_name AS firstName,
          middle_name AS middleName,
          gender,
          -- Always return MySQL DATE as exact YYYY-MM-DD (no timezone/ISO conversion)
          DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dateOfBirth,
          email,

          contact_number AS contactNumber,
          department,
          level AS year,
          group_name AS section,
          status
        FROM participants
        ORDER BY id ASC`
      );

      res.json({ participants: rows });

    } catch (err) {
      res.status(500).json({ message: "Failed to fetch participants" });
    }
  });

  // GET /participants/:id
  router.get("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const [rows] = await pool.query(
        `SELECT
          id,
          participant_identifier AS participantIdentifier,
          qr_code AS qrCode,
          photo,
          last_name AS lastName,
          first_name AS firstName,
          middle_name AS middleName,
          gender,
          DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dateOfBirth,
          email,
          contact_number AS contactNumber,
          department,
          level AS year,
          group_name AS section,
          status
        FROM participants
        WHERE id = ?
        LIMIT 1`,
        [id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Participant not found" });
      }

      res.json({ participant: rows[0] });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch participant" });
    }
  });

  // POST /participants/:id/photo - Upload or change photo
  router.post("/:id/photo", upload.single("photo"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No photo file provided." });
      }

      // Check participant exists
      const [existing] = await pool.query("SELECT id, photo FROM participants WHERE id = ?", [id]);
      if (!existing || existing.length === 0) {
        // Remove uploaded file since participant doesn't exist
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ message: "Participant not found" });
      }

      // Delete old photo file if exists
      const oldPhoto = existing[0].photo;
      if (oldPhoto) {
        const oldPath = path.resolve(__dirname, "../../uploads", oldPhoto);
        fs.unlink(oldPath, () => {});
      }

      // Store relative path (e.g., "participants/filename.jpg")
      const relativePath = `participants/${req.file.filename}`;
      await pool.query("UPDATE participants SET photo = ? WHERE id = ?", [relativePath, id]);

      res.json({ message: "Photo uploaded successfully", photo: relativePath });
    } catch (err) {
      console.error("POST /participants/:id/photo error:", err);
      res.status(500).json({ message: "Failed to upload photo" });
    }
  });

  // DELETE /participants/:id/photo - Remove photo
  router.delete("/:id/photo", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const [existing] = await pool.query("SELECT id, photo FROM participants WHERE id = ?", [id]);
      if (!existing || existing.length === 0) {
        return res.status(404).json({ message: "Participant not found" });
      }

      const oldPhoto = existing[0].photo;
      if (oldPhoto) {
        const oldPath = path.resolve(__dirname, "../../uploads", oldPhoto);
        fs.unlink(oldPath, () => {});
      }

      await pool.query("UPDATE participants SET photo = NULL WHERE id = ?", [id]);
      res.json({ message: "Photo removed successfully" });
    } catch (err) {
      console.error("DELETE /participants/:id/photo error:", err);
      res.status(500).json({ message: "Failed to remove photo" });
    }
  });

  // POST /participants
  router.post("/", async (req, res) => {
    try {
      // Support both camelCase (frontend) and snake_case (if sent)

      const {
        participantIdentifier,
        lastName,
        firstName,
        middleName,
        gender,
        dateOfBirth,
        email,
        contactNumber,
        department,
        level,
        groupName,
        status,
        photo,
        // snake_case fallbacks
        participant_identifier,
        last_name,
        first_name,
        middle_name,
        date_of_birth,
        contact_number,
        group_name,
        // Legacy fallbacks for backward compatibility
        studentNumber,
        student_number,
        course,
        year,
        section,
      } = req.body || {};

      const resolved = {
        participantIdentifier: participantIdentifier ?? participant_identifier ?? studentNumber ?? student_number,
        lastName: lastName ?? last_name,
        firstName: firstName ?? first_name,
        middleName: middleName ?? middle_name,
        gender,
        dateOfBirth: dateOfBirth ?? date_of_birth,
        email,
        contactNumber: contactNumber ?? contact_number,
        department: department ?? course,
        level: level ?? year,
        groupName: groupName ?? group_name ?? section,
        status,
        photo,
      };

      // Basic validation (use resolved values)
      if (!resolved.participantIdentifier || !String(resolved.participantIdentifier).trim()) {
        return res.status(400).json({ message: "participantIdentifier is required" });
      }
      if (!resolved.lastName || !String(resolved.lastName).trim()) {
        return res.status(400).json({ message: "lastName is required" });
      }
      if (!resolved.firstName || !String(resolved.firstName).trim()) {
        return res.status(400).json({ message: "firstName is required" });
      }
      if (!resolved.middleName || !String(resolved.middleName).trim()) {
        return res.status(400).json({ message: "middleName is required" });
      }
      if (!resolved.gender || !String(resolved.gender).trim()) {
        return res.status(400).json({ message: "gender is required" });
      }
      if (!resolved.department || !String(resolved.department).trim()) {
        return res.status(400).json({ message: "department is required" });
      }
      if (!resolved.level || !String(resolved.level).trim()) {
        return res.status(400).json({ message: "level is required" });
      }
      if (!resolved.groupName || !String(resolved.groupName).trim()) {
        return res.status(400).json({ message: "groupName is required" });
      }
      if (!resolved.email || !String(resolved.email).trim()) {
        return res.status(400).json({ message: "email is required" });
      }
      if (!resolved.contactNumber || !String(resolved.contactNumber).trim()) {
        return res.status(400).json({ message: "contactNumber is required" });
      }

      const normalizedIdentifier = String(resolved.participantIdentifier).trim();
      const normalizedLastName = String(resolved.lastName).trim();
      const normalizedFirstName = String(resolved.firstName).trim();
      const normalizedMiddleName = String(resolved.middleName).trim();
      const normalizedGender = String(resolved.gender).trim();
      const normalizedEmail = String(resolved.email).trim();
      const normalizedContactNumber = String(resolved.contactNumber).trim();

      const normalizedDepartment = String(resolved.department).trim();
      const normalizedLevel = String(resolved.level).trim();
      const normalizedGroupName = String(resolved.groupName).trim();

      const normalizedDateOfBirthRaw = resolved.dateOfBirth ? String(resolved.dateOfBirth).trim() : "";
      // Ensure DATE-only (YYYY-MM-DD) for MySQL DATE field.
      const normalizedDateOfBirth = normalizedDateOfBirthRaw
        ? /^\d{4}-\d{2}-\d{2}$/.test(normalizedDateOfBirthRaw)
          ? normalizedDateOfBirthRaw
          : /^\d{4}-\d{2}-\d{2}/.test(normalizedDateOfBirthRaw)
            ? normalizedDateOfBirthRaw.slice(0, 10)
            : null
        : null;

      const normalizedStatus =
        resolved.status && String(resolved.status).trim() ? String(resolved.status).trim() : "Active";

      const normalizedPhoto = resolved.photo ? String(resolved.photo).trim() : null;

      const [nameColumnResult] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'participants'
           AND COLUMN_NAME = 'name'`
      );
      const hasNameColumn = Number(nameColumnResult?.[0]?.count ?? 0) > 0;

      const resolvedName = `${normalizedFirstName} ${normalizedMiddleName} ${normalizedLastName}`.trim().replace(/\s+/g, ' ');

      const insertSql = hasNameColumn
        ? `INSERT INTO participants (
            participant_identifier,
            qr_code,
            name,
            last_name,
            first_name,
            middle_name,
            gender,
            date_of_birth,
            email,
            contact_number,
            department,
            level,
            group_name,
            status,
            photo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        : `INSERT INTO participants (
            participant_identifier,
            qr_code,
            last_name,
            first_name,
            middle_name,
            gender,
            date_of_birth,
            email,
            contact_number,
            department,
            level,
            group_name,
            status,
            photo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const insertParams = hasNameColumn
        ? [
            normalizedIdentifier,
            normalizedIdentifier,
            resolvedName,
            normalizedLastName,
            normalizedFirstName,
            normalizedMiddleName,
            normalizedGender,
            normalizedDateOfBirth,
            normalizedEmail,
            normalizedContactNumber,
            normalizedDepartment,
            normalizedLevel,
            normalizedGroupName,
            normalizedStatus,
            normalizedPhoto,
          ]
        : [
            normalizedIdentifier,
            normalizedIdentifier,
            normalizedLastName,
            normalizedFirstName,
            normalizedMiddleName,
            normalizedGender,
            normalizedDateOfBirth,
            normalizedEmail,
            normalizedContactNumber,
            normalizedDepartment,
            normalizedLevel,
            normalizedGroupName,
            normalizedStatus,
            normalizedPhoto,
          ];

      const [result] = await pool.query(insertSql, insertParams);

      res.status(201).json({
        message: "Participant created",
        id: result.insertId,
      });
    } catch (err) {
      console.error("POST /participants error:", err);
      console.error("Request body:", req.body);

      // MySQL duplicate key -> ER_DUP_ENTRY
      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Participant identifier must be unique." });
      }

      return res.status(500).json({ message: "Failed to create participant" });
    }
  });

  // PUT /participants/:id
  router.put("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const {
        participantIdentifier,
        lastName,
        firstName,
        middleName,
        gender,
        dateOfBirth,
        email,
        contactNumber,
        department,
        level,
        groupName,
        status,
        photo,
        // Legacy fallbacks
        studentNumber,
        course,
        year,
        section,
      } = req.body || {};

      const resolvedIdentifier = participantIdentifier ?? studentNumber;
      const resolvedDepartment = department ?? course;
      const resolvedLevel = level ?? year;
      const resolvedGroupName = groupName ?? section;

      // Basic validation
      if (!resolvedIdentifier || !String(resolvedIdentifier).trim()) {
        return res.status(400).json({ message: "participantIdentifier is required" });
      }
      if (!lastName || !String(lastName).trim()) {
        return res.status(400).json({ message: "lastName is required" });
      }
      if (!firstName || !String(firstName).trim()) {
        return res.status(400).json({ message: "firstName is required" });
      }
      if (!middleName || !String(middleName).trim()) {
        return res.status(400).json({ message: "middleName is required" });
      }
      if (!gender || !String(gender).trim()) {
        return res.status(400).json({ message: "gender is required" });
      }
      if (!resolvedDepartment || !String(resolvedDepartment).trim()) {
        return res.status(400).json({ message: "department is required" });
      }
      if (!resolvedLevel || !String(resolvedLevel).trim()) {
        return res.status(400).json({ message: "level is required" });
      }
      if (!resolvedGroupName || !String(resolvedGroupName).trim()) {
        return res.status(400).json({ message: "groupName is required" });
      }
      if (!email || !String(email).trim()) {
        return res.status(400).json({ message: "email is required" });
      }
      if (!contactNumber || !String(contactNumber).trim()) {
        return res.status(400).json({ message: "contactNumber is required" });
      }

      const normalizedIdentifier = String(resolvedIdentifier).trim();
      const normalizedLastName = String(lastName).trim();
      const normalizedFirstName = String(firstName).trim();
      const normalizedMiddleName = String(middleName).trim();
      const normalizedGender = String(gender).trim();
      const normalizedEmail = String(email).trim();
      const normalizedContactNumber = String(contactNumber).trim();

      const normalizedDepartment = String(resolvedDepartment).trim();
      const normalizedLevel = String(resolvedLevel).trim();
      const normalizedGroupName = String(resolvedGroupName).trim();

      const normalizedDateOfBirthRaw = dateOfBirth ? String(dateOfBirth).trim() : "";
      const normalizedDateOfBirth = normalizedDateOfBirthRaw
        ? /^\d{4}-\d{2}-\d{2}/.test(normalizedDateOfBirthRaw)
          ? normalizedDateOfBirthRaw.slice(0, 10)
          : null
        : null;

      const normalizedStatus = status && String(status).trim() ? String(status).trim() : "Active";

      const normalizedPhoto = photo !== undefined ? (photo ? String(photo).trim() : null) : undefined;

      const [nameColumnResult] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'participants'
           AND COLUMN_NAME = 'name'`
      );
      const hasNameColumn = Number(nameColumnResult?.[0]?.count ?? 0) > 0;
      const resolvedName = `${normalizedFirstName} ${normalizedMiddleName} ${normalizedLastName}`.trim().replace(/\s+/g, ' ');

      // Build update SQL dynamically based on whether photo is included
      let updateSql;
      let updateParams;

      if (hasNameColumn) {
        if (normalizedPhoto !== undefined) {
          updateSql = `UPDATE participants
             SET participant_identifier = ?, qr_code = ?, name = ?, last_name = ?, first_name = ?,
                 middle_name = ?, gender = ?, date_of_birth = ?, email = ?,
                 contact_number = ?, department = ?, level = ?, group_name = ?, status = ?, photo = ?
             WHERE id = ?`;
          updateParams = [
            normalizedIdentifier, normalizedIdentifier, resolvedName,
            normalizedLastName, normalizedFirstName, normalizedMiddleName,
            normalizedGender, normalizedDateOfBirth, normalizedEmail,
            normalizedContactNumber, normalizedDepartment, normalizedLevel,
            normalizedGroupName, normalizedStatus, normalizedPhoto, id,
          ];
        } else {
          updateSql = `UPDATE participants
             SET participant_identifier = ?, qr_code = ?, name = ?, last_name = ?, first_name = ?,
                 middle_name = ?, gender = ?, date_of_birth = ?, email = ?,
                 contact_number = ?, department = ?, level = ?, group_name = ?, status = ?
             WHERE id = ?`;
          updateParams = [
            normalizedIdentifier, normalizedIdentifier, resolvedName,
            normalizedLastName, normalizedFirstName, normalizedMiddleName,
            normalizedGender, normalizedDateOfBirth, normalizedEmail,
            normalizedContactNumber, normalizedDepartment, normalizedLevel,
            normalizedGroupName, normalizedStatus, id,
          ];
        }
      } else {
        if (normalizedPhoto !== undefined) {
          updateSql = `UPDATE participants
             SET participant_identifier = ?, qr_code = ?, last_name = ?, first_name = ?,
                 middle_name = ?, gender = ?, date_of_birth = ?, email = ?,
                 contact_number = ?, department = ?, level = ?, group_name = ?, status = ?, photo = ?
             WHERE id = ?`;
          updateParams = [
            normalizedIdentifier, normalizedIdentifier,
            normalizedLastName, normalizedFirstName, normalizedMiddleName,
            normalizedGender, normalizedDateOfBirth, normalizedEmail,
            normalizedContactNumber, normalizedDepartment, normalizedLevel,
            normalizedGroupName, normalizedStatus, normalizedPhoto, id,
          ];
        } else {
          updateSql = `UPDATE participants
             SET participant_identifier = ?, qr_code = ?, last_name = ?, first_name = ?,
                 middle_name = ?, gender = ?, date_of_birth = ?, email = ?,
                 contact_number = ?, department = ?, level = ?, group_name = ?, status = ?
             WHERE id = ?`;
          updateParams = [
            normalizedIdentifier, normalizedIdentifier,
            normalizedLastName, normalizedFirstName, normalizedMiddleName,
            normalizedGender, normalizedDateOfBirth, normalizedEmail,
            normalizedContactNumber, normalizedDepartment, normalizedLevel,
            normalizedGroupName, normalizedStatus, id,
          ];
        }
      }

      const [result] = await pool.query(updateSql, updateParams);

      // result.affectedRows is available from mysql2
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({ message: "Participant not found" });
      }

      return res.json({ message: "Participant updated" });
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Participant identifier must be unique." });
      }
      return res.status(500).json({ message: "Failed to update participant" });
    }
  });

  // DELETE /participants/:id
  router.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      // Get photo path before deleting
      const [existing] = await pool.query("SELECT photo FROM participants WHERE id = ?", [id]);
      if (existing && existing.length > 0 && existing[0].photo) {
        const photoPath = path.resolve(__dirname, "../../uploads", existing[0].photo);
        fs.unlink(photoPath, () => {});
      }

      const [result] = await pool.query("DELETE FROM participants WHERE id = ?", [id]);

      // result.affectedRows is available from mysql2
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({ message: "Participant not found" });
      }

      return res.json({ message: "Participant deleted" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete participant" });
    }
  });

  // DELETE /participants
  router.delete("/", async (req, res) => {
    try {
      const [countResult] = await pool.query("SELECT COUNT(*) AS total FROM participants");
      const deletedCount = Number(countResult?.[0]?.total ?? 0);

      const [nameColumnResult] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'participants'
           AND COLUMN_NAME = 'name'`
      );
      const hasNameColumn = Number(nameColumnResult?.[0]?.count ?? 0) > 0;

      await pool.query("DROP TABLE IF EXISTS participants");
      await pool.query(`CREATE TABLE participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        participant_identifier VARCHAR(64) NOT NULL,
        qr_code VARCHAR(255) NULL,${hasNameColumn ? "\n        name VARCHAR(512) NOT NULL," : ""}
        last_name VARCHAR(255) NOT NULL,
        first_name VARCHAR(255) NOT NULL,
        middle_name VARCHAR(255) NOT NULL,
        gender VARCHAR(32) NOT NULL,
        date_of_birth DATE NULL,
        email VARCHAR(255) NOT NULL,
        contact_number VARCHAR(64) NOT NULL,
        department VARCHAR(64) NOT NULL,
        level VARCHAR(16) NOT NULL,
        group_name VARCHAR(16) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'Active',
        photo VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_participants_identifier (participant_identifier)
      )`);

      return res.json({
        message: "All participants deleted",
        deletedCount,
      });
    } catch (err) {
      console.error("Failed to reset participants table during bulk delete:", err);
      return res.status(500).json({ message: "Failed to delete all participants" });
    }
  });

  return router;
}

