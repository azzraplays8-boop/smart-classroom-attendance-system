import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import * as XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Bulk Import helpers ────────────────────────────────────────────
const IMPORT_FIELD_DEFS = {
  participantIdentifier: { label: "Participant ID", required: true },
  lastName: { label: "Last Name", required: true },
  firstName: { label: "First Name", required: true },
  middleName: { label: "Middle Name", required: true },
  gender: { label: "Gender", required: true },
  dateOfBirth: { label: "Date of Birth", required: false },
  email: { label: "Email", required: true },
  contactNumber: { label: "Contact Number", required: true },
  department: { label: "Department / Group", required: true },
  level: { label: "Category", required: true },
  groupName: { label: "Team", required: true },
  status: { label: "Status", required: false },
};

function normText(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function normEmail(v) {
  return normText(v).toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normText(email));
}

function normDate(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  // Excel serial date (number)
  if (/^\d+(\.\d+)?$/.test(raw)) {
    try {
      const d = XLSX.SSF.parse_date_code(Number(raw));
      if (d) {
        return `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      }
    } catch {
      /* ignore */
    }
  }
  // Real Date object
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // YYYY/M/D or YYYY-MM-D
  const m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return null;
}

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".xlsx", ".xls", ".csv"].includes(ext)) cb(null, true);
    else cb(new Error("Only .xlsx, .xls, and .csv files are allowed."));
  },
});

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

// GET /participants/imports — Import history (audit log)
  router.get("/imports", async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT
          id,
          filename,
          file_size AS fileSize,
          total_rows AS total,
          valid_rows AS valid,
          imported_rows AS imported,
          duplicate_rows AS duplicates,
          invalid_rows AS invalid,
          skipped_rows AS skipped,
          updated_rows AS updated,
          duplicate_mode AS duplicateMode,
          status,
          started_at AS startedAt,
          completed_at AS completedAt,
          created_by AS createdBy,
          created_at AS createdAt
        FROM participant_imports
        ORDER BY id DESC
        LIMIT 100
      `);
      res.json({ imports: rows });
    } catch (err) {
      console.error("GET /participants/imports error:", err);
      res.status(500).json({ message: "Failed to fetch import history" });
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

// POST /participants/bulk-import — Enterprise Bulk Import
  // multer parses the file field 'file' (single). The 'mapping' field is a JSON string.
  router.post(
    "/bulk-import",
    importUpload.single("file"),
    async (req, res) => {
      const startedAt = new Date();
      try {
        // ── Validate file ─────────────────────────────────────────
        if (!req.file) {
          return res.status(400).json({ message: "No spreadsheet file provided." });
        }
        const fileBuffer = req.file.buffer;
        const filename = req.file.originalname;
        const fileSize = req.file.size;

        // ── Parse mapping + duplicateMode ─────────────────────────
        let mapping = {};
        let duplicateMode = "skip";
        let importMode = "insert";
        try {
          const parsedMapping = JSON.parse(req.body?.mapping || "{}");
          if (parsedMapping && typeof parsedMapping === "object") mapping = parsedMapping;
        } catch {
          return res.status(400).json({ message: "Invalid mapping payload." });
        }

        if (req.body?.duplicateMode) {
          const mode = String(req.body.duplicateMode).toLowerCase();
          if (["skip", "update", "stop"].includes(mode)) duplicateMode = mode;
        }

        if (req.body?.importMode) {
          const mode = String(req.body.importMode).toLowerCase();
          if (["insert", "insert_update"].includes(mode)) importMode = mode;
        }

        // ── Parse the spreadsheet (server-side re-parse) ──────────
        let workbook;
        try {
          workbook = XLSX.read(fileBuffer, { type: "buffer" });
        } catch {
          return res.status(400).json({ message: "Failed to read the spreadsheet file." });
        }

        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          return res.status(400).json({ message: "The spreadsheet contains no sheets." });
        }
        const sheet = workbook.Sheets[firstSheetName];

        // Convert to array of objects using raw values (preserve numbers/dates).
        let rows = [];
        try {
          rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true, blankrows: false });
        } catch {
          return res.status(400).json({ message: "Failed to parse spreadsheet rows." });
        }

        if (!rows || rows.length === 0) {
          return res.status(400).json({ message: "The spreadsheet contains no data rows." });
        }

        // ── Build per-row field extraction function from mapping ──
        // mapping format: { fieldKey: "<exact header>", ... } OR { fieldKey: { column: "<header>" } }
        const fieldResolvers = {};
        for (const fieldKey of Object.keys(IMPORT_FIELD_DEFS)) {
          let header = null;
          const mapped = mapping[fieldKey];
          if (typeof mapped === "string") header = mapped;
          else if (mapped && typeof mapped === "object" && mapped.column) header = mapped.column;
          if (header) fieldResolvers[fieldKey] = String(header).trim();
        }

        const getCell = (row, header) => {
          if (!header) return "";
          // sheet_to_json already keys by header name; fall back to direct property access.
          return row?.[header] ?? "";
        };

        // ── Load existing identifiers & emails for duplicate checks ──
        const [existingRows] = await pool.query(
          "SELECT participant_identifier, email FROM participants"
        );
        const existingIdentifiers = new Set(
          existingRows.map((r) => String(r.participant_identifier).trim().toLowerCase()).filter(Boolean)
        );
        const existingEmails = new Set(
          existingRows.map((r) => normEmail(r.email)).filter(Boolean)
        );

        const totalRows = rows.length;
        let validRows = 0;
        let importedRows = 0;
        let duplicateRows = 0;
        let invalidRows = 0;
        let skippedRows = 0;
        let updatedRows = 0;

        const errors = [];
        const processedIdentifiers = new Set();
        const processedEmails = new Set();
        const toInsert = [];
        const toUpdate = [];

        // ── Validate every row ─────────────────────────────────────
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowNumber = i + 2; // +2 because sheet_to_json drops the header row

          const participantIdentifier = normText(getCell(row, fieldResolvers.participantIdentifier));
          const lastName = normText(getCell(row, fieldResolvers.lastName));
          const firstName = normText(getCell(row, fieldResolvers.firstName));
          const middleName = normText(getCell(row, fieldResolvers.middleName));
          const gender = normText(getCell(row, fieldResolvers.gender));
          const email = normEmail(getCell(row, fieldResolvers.email));
          const contactNumber = normText(getCell(row, fieldResolvers.contactNumber));
          const department = normText(getCell(row, fieldResolvers.department));
          const level = normText(getCell(row, fieldResolvers.level));
          const groupName = normText(getCell(row, fieldResolvers.groupName));
          const status = normText(getCell(row, fieldResolvers.status)) || "Active";
          const dateOfBirth = normDate(getCell(row, fieldResolvers.dateOfBirth));

          const reasons = [];
          const isMissing = (v) => !v;

          // Required field checks
          if (isMissing(participantIdentifier)) reasons.push("Missing Participant ID");
          if (isMissing(lastName)) reasons.push("Missing Last Name");
          if (isMissing(firstName)) reasons.push("Missing First Name");
          if (isMissing(middleName)) reasons.push("Missing Middle Name");
          if (isMissing(gender)) reasons.push("Missing Gender");
          if (isMissing(email)) reasons.push("Missing Email");
          else if (!isValidEmail(email)) reasons.push("Invalid Email");
          if (isMissing(contactNumber)) reasons.push("Missing Contact Number");
          if (isMissing(department)) reasons.push("Missing Department");
          if (isMissing(level)) reasons.push("Missing Category");
          if (isMissing(groupName)) reasons.push("Missing Team");

          // Duplicate detection (within batch + against DB)
          const idKey = participantIdentifier.toLowerCase();
          const isDuplicateInBatch = processedIdentifiers.has(idKey);
          const isDuplicateInDb = existingIdentifiers.has(idKey);
          const isDuplicate = isDuplicateInBatch || isDuplicateInDb;

          if (participantIdentifier && isDuplicate) {
            if (duplicateMode === "stop") {
              reasons.push("Duplicate Participant ID (Stop mode)");
            } else if (duplicateMode === "update") {
              // Handle update below; do not flag as invalid now.
            } else {
              // skip (default)
              reasons.push("Duplicate Participant ID");
            }
          }

          const emailKey = email; // already normalized
          const isEmailDuplicateInBatch = email ? processedEmails.has(emailKey) : false;

          if (reasons.length > 0) {
            invalidRows++;
            errors.push({
              rowNumber,
              participantIdentifier: participantIdentifier || "",
              reason: reasons.join("; "),
            });
            continue;
          }

          // Valid row
          validRows++;
          const record = {
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
          };

          if (isDuplicate && duplicateMode === "update") {
            // Update existing (db) or in-batch (use first occurrence)
            toUpdate.push(record);
            updatedRows++;
            duplicateRows++;
            // still mark identifiers/emails processed to avoid repeated updates
            processedIdentifiers.add(idKey);
            if (email) processedEmails.add(emailKey);
            continue;
          }

          if (isDuplicate) {
            // skip mode
            duplicateRows++;
            skippedRows++;
            errors.push({
              rowNumber,
              participantIdentifier: participantIdentifier || "",
              reason: "Duplicate Participant ID",
            });
            continue;
          }

          // Email duplicate within batch (not against DB) → invalid
          if (email && isEmailDuplicateInBatch) {
            invalidRows++;
            errors.push({
              rowNumber,
              participantIdentifier: participantIdentifier || "",
              reason: "Duplicate Email",
            });
            continue;
          }

          processedIdentifiers.add(idKey);
          if (email) processedEmails.add(emailKey);
          toInsert.push(record);
        }

        // ── Determine 'name' column presence ──────────────────────
        const [nameColResult] = await pool.query(
          `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants' AND COLUMN_NAME = 'name'`
        );
        const hasNameColumn = Number(nameColResult?.[0]?.count ?? 0) > 0;

        // ── Transaction + batch insert ─────────────────────────────
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          // Audit log row
          const [importResult] = await connection.query(
            `INSERT INTO participant_imports
              (filename, file_size, total_rows, valid_rows, imported_rows, duplicate_rows,
               invalid_rows, skipped_rows, updated_rows, duplicate_mode, status, started_at, completed_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              filename,
              fileSize,
              totalRows,
              validRows,
              toInsert.length,
              duplicateRows,
              invalidRows,
              skippedRows,
              updatedRows,
              duplicateMode,
              "completed",
              startedAt,
              new Date(),
              req.body?.createdBy || null,
            ]
          );
          const importId = importResult.insertId;

          const insertColumns = [
            "participant_identifier",
            "qr_code",
            ...(hasNameColumn ? ["name"] : []),
            "last_name",
            "first_name",
            "middle_name",
            "gender",
            "date_of_birth",
            "email",
            "contact_number",
            "department",
            "level",
            "group_name",
            "status",
          ];
          const insertPlaceholders = insertColumns.map(() => "?").join(", ");
          const insertSql = `INSERT INTO participants (${insertColumns.join(", ")})
             VALUES (${insertPlaceholders})`;

          // Batch insert in chunks of BATCH_SIZE for scalability
          const BATCH_SIZE = 500;
          for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
            const batch = toInsert.slice(i, i + BATCH_SIZE);
            const values = [];
            for (const rec of batch) {
              const resolvedName = `${rec.firstName} ${rec.middleName} ${rec.lastName}`.trim().replace(/\s+/g, " ");
              const cols = [
                rec.participantIdentifier,
                rec.participantIdentifier, // qr_code = identifier (same as manual add)
              ];
              if (hasNameColumn) cols.push(resolvedName);
              cols.push(
                rec.lastName,
                rec.firstName,
                rec.middleName,
                rec.gender,
                rec.dateOfBirth,
                rec.email,
                rec.contactNumber,
                rec.department,
                rec.level,
                rec.groupName,
                rec.status
              );
              values.push(cols);
            }
            const flat = values.flat();
            const rowsPlaceholder = batch.map(() => `(${insertPlaceholders})`).join(", ");
            await connection.query(`INSERT INTO participants (${insertColumns.join(", ")})
              VALUES ${rowsPlaceholder}`, flat);
          }
          importedRows = toInsert.length;

          // Handle updates (duplicateMode === "update")
          if (toUpdate.length > 0) {
            const UPDATE_BATCH = 500;
            for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
              const batch = toUpdate.slice(i, i + UPDATE_BATCH);
              for (const rec of batch) {
                const resolvedName = `${rec.firstName} ${rec.middleName} ${rec.lastName}`.trim().replace(/\s+/g, " ");
                if (hasNameColumn) {
                  await connection.query(
                    `UPDATE participants SET
                       qr_code = ?, name = ?, last_name = ?, first_name = ?, middle_name = ?,
                       gender = ?, date_of_birth = ?, email = ?, contact_number = ?,
                       department = ?, level = ?, group_name = ?, status = ?
                     WHERE participant_identifier = ?`,
                    [
                      rec.participantIdentifier, resolvedName,
                      rec.lastName, rec.firstName, rec.middleName, rec.gender,
                      rec.dateOfBirth, rec.email, rec.contactNumber, rec.department,
                      rec.level, rec.groupName, rec.status, rec.participantIdentifier,
                    ]
                  );
                } else {
                  await connection.query(
                    `UPDATE participants SET
                       qr_code = ?, last_name = ?, first_name = ?, middle_name = ?,
                       gender = ?, date_of_birth = ?, email = ?, contact_number = ?,
                       department = ?, level = ?, group_name = ?, status = ?
                     WHERE participant_identifier = ?`,
                    [
                      rec.participantIdentifier,
                      rec.lastName, rec.firstName, rec.middleName, rec.gender,
                      rec.dateOfBirth, rec.email, rec.contactNumber, rec.department,
                      rec.level, rec.groupName, rec.status, rec.participantIdentifier,
                    ]
                  );
                }
              }
            }
          }

          // Persist error report rows
          if (errors.length > 0) {
            const errValues = errors.map((e) => [importId, e.rowNumber, e.participantIdentifier, e.reason]);
            const errPlaceholders = errors.map(() => "(?, ?, ?, ?)").join(", ");
            await connection.query(
              `INSERT INTO participant_import_errors (import_id, \`row_number\`, participant_identifier, reason)
               VALUES ${errPlaceholders}`,
              errValues.flat()
            );
          }

          await connection.commit();

          return res.status(200).json({
            message: "Bulk import completed",
            importId,
            summary: {
              total: totalRows,
              valid: validRows,
              imported: importedRows,
              duplicates: duplicateRows,
              invalid: invalidRows,
              skipped: skippedRows,
              updated: updatedRows,
            },
            errors,
          });
        } catch (err) {
          try {
            await connection.rollback();
          } catch {
            /* ignore */
          }
          console.error("Bulk import transaction error:", err);
          return res.status(500).json({ message: "Bulk import failed. No records were changed." });
        } finally {
          connection.release();
        }
      } catch (err) {
        console.error("POST /participants/bulk-import error:", err);
        return res.status(500).json({ message: "Failed to process bulk import." });
      }
    }
  );

return router;
}

