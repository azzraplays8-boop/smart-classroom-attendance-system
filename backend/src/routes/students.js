import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function studentsRouter({ pool, upload }) {
  const router = express.Router();

  // GET /students
  router.get("/", async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT
          id,
          student_number AS studentNumber,
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
          course,
          year,
          section,
          status
        FROM students
        ORDER BY id ASC`
      );

      res.json({ students: rows });

    } catch (err) {
      res.status(500).json({ message: "Failed to fetch students" });
    }
  });

  // GET /students/:id
  router.get("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const [rows] = await pool.query(
        `SELECT
          id,
          student_number AS studentNumber,
          qr_code AS qrCode,
          photo,
          last_name AS lastName,
          first_name AS firstName,
          middle_name AS middleName,
          gender,
          DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dateOfBirth,
          email,
          contact_number AS contactNumber,
          course,
          year,
          section,
          status
        FROM students
        WHERE id = ?
        LIMIT 1`,
        [id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Student not found" });
      }

      res.json({ student: rows[0] });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch student" });
    }
  });

  // POST /students/:id/photo - Upload or change photo
  router.post("/:id/photo", upload.single("photo"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No photo file provided." });
      }

      // Check student exists
      const [existing] = await pool.query("SELECT id, photo FROM students WHERE id = ?", [id]);
      if (!existing || existing.length === 0) {
        // Remove uploaded file since student doesn't exist
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ message: "Student not found" });
      }

      // Delete old photo file if exists
      const oldPhoto = existing[0].photo;
      if (oldPhoto) {
        const oldPath = path.resolve(__dirname, "../../uploads", oldPhoto);
        fs.unlink(oldPath, () => {});
      }

      // Store relative path (e.g., "students/filename.jpg")
      const relativePath = `students/${req.file.filename}`;
      await pool.query("UPDATE students SET photo = ? WHERE id = ?", [relativePath, id]);

      res.json({ message: "Photo uploaded successfully", photo: relativePath });
    } catch (err) {
      console.error("POST /students/:id/photo error:", err);
      res.status(500).json({ message: "Failed to upload photo" });
    }
  });

  // DELETE /students/:id/photo - Remove photo
  router.delete("/:id/photo", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const [existing] = await pool.query("SELECT id, photo FROM students WHERE id = ?", [id]);
      if (!existing || existing.length === 0) {
        return res.status(404).json({ message: "Student not found" });
      }

      const oldPhoto = existing[0].photo;
      if (oldPhoto) {
        const oldPath = path.resolve(__dirname, "../../uploads", oldPhoto);
        fs.unlink(oldPath, () => {});
      }

      await pool.query("UPDATE students SET photo = NULL WHERE id = ?", [id]);
      res.json({ message: "Photo removed successfully" });
    } catch (err) {
      console.error("DELETE /students/:id/photo error:", err);
      res.status(500).json({ message: "Failed to remove photo" });
    }
  });

  // POST /students
  router.post("/", async (req, res) => {
    try {
      // Support both camelCase (frontend) and snake_case (if sent)

      const {
        studentNumber,
        lastName,
        firstName,
        middleName,
        gender,
        dateOfBirth,
        email,
        contactNumber,
        course,
        year,
        section,
        status,
        photo,
        // snake_case fallbacks
        student_number,
        last_name,
        first_name,
        middle_name,
        date_of_birth,
        contact_number,
      } = req.body || {};

      const resolved = {
        studentNumber: studentNumber ?? student_number,
        lastName: lastName ?? last_name,
        firstName: firstName ?? first_name,
        middleName: middleName ?? middle_name,
        gender,
        dateOfBirth: dateOfBirth ?? date_of_birth,
        email,
        contactNumber: contactNumber ?? contact_number,
        course,
        year,
        section,
        status,
        photo,
      };

      // Basic validation (use resolved values)
      if (!resolved.studentNumber || !String(resolved.studentNumber).trim()) {
        return res.status(400).json({ message: "studentNumber is required" });
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
      if (!resolved.course || !String(resolved.course).trim()) {
        return res.status(400).json({ message: "course is required" });
      }
      if (!resolved.year || !String(resolved.year).trim()) {
        return res.status(400).json({ message: "year is required" });
      }
      if (!resolved.section || !String(resolved.section).trim()) {
        return res.status(400).json({ message: "section is required" });
      }
      if (!resolved.email || !String(resolved.email).trim()) {
        return res.status(400).json({ message: "email is required" });
      }
      if (!resolved.contactNumber || !String(resolved.contactNumber).trim()) {
        return res.status(400).json({ message: "contactNumber is required" });
      }

      const normalizedStudentNumber = String(resolved.studentNumber).trim();
      const normalizedLastName = String(resolved.lastName).trim();
      const normalizedFirstName = String(resolved.firstName).trim();
      const normalizedMiddleName = String(resolved.middleName).trim();
      const normalizedGender = String(resolved.gender).trim();
      const normalizedEmail = String(resolved.email).trim();
      const normalizedContactNumber = String(resolved.contactNumber).trim();

      const normalizedCourse = String(resolved.course).trim();
      const normalizedYear = String(resolved.year).trim();
      const normalizedSection = String(resolved.section).trim();

      const normalizedDateOfBirthRaw = resolved.dateOfBirth ? String(resolved.dateOfBirth).trim() : "";
      // Ensure DATE-only (YYYY-MM-DD) for MySQL DATE field.
      // If backend ever receives an ISO timestamp, strip time without timezone conversion.
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
           AND TABLE_NAME = 'students'
           AND COLUMN_NAME = 'name'`
      );
      const hasNameColumn = Number(nameColumnResult?.[0]?.count ?? 0) > 0;

      const resolvedName = `${normalizedFirstName} ${normalizedMiddleName} ${normalizedLastName}`.trim().replace(/\s+/g, ' ');

      const insertSql = hasNameColumn
        ? `INSERT INTO students (
            student_number,
            qr_code,
            name,
            last_name,
            first_name,
            middle_name,
            gender,
            date_of_birth,
            email,
            contact_number,
            course,
            year,
            section,
            status,
            photo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        : `INSERT INTO students (
            student_number,
            qr_code,
            last_name,
            first_name,
            middle_name,
            gender,
            date_of_birth,
            email,
            contact_number,
            course,
            year,
            section,
            status,
            photo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const insertParams = hasNameColumn
        ? [
            normalizedStudentNumber,
            normalizedStudentNumber,
            resolvedName,
            normalizedLastName,
            normalizedFirstName,
            normalizedMiddleName,
            normalizedGender,
            normalizedDateOfBirth,
            normalizedEmail,
            normalizedContactNumber,
            normalizedCourse,
            normalizedYear,
            normalizedSection,
            normalizedStatus,
            normalizedPhoto,
          ]
        : [
            normalizedStudentNumber,
            normalizedStudentNumber,
            normalizedLastName,
            normalizedFirstName,
            normalizedMiddleName,
            normalizedGender,
            normalizedDateOfBirth,
            normalizedEmail,
            normalizedContactNumber,
            normalizedCourse,
            normalizedYear,
            normalizedSection,
            normalizedStatus,
            normalizedPhoto,
          ];

      const [result] = await pool.query(insertSql, insertParams);

      res.status(201).json({
        message: "Student created",
        id: result.insertId,
      });
    } catch (err) {
      console.error("POST /students error:", err);
      console.error("Request body:", req.body);

      // MySQL duplicate key -> ER_DUP_ENTRY
      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Student Number must be unique." });
      }

      return res.status(500).json({ message: "Failed to create student" });
    }
  });

  // PUT /students/:id
  router.put("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const {
        studentNumber,
        lastName,
        firstName,
        middleName,
        gender,
        dateOfBirth,
        email,
        contactNumber,
        course,
        year,
        section,
        status,
        photo,
      } = req.body || {};

      // Basic validation
      if (!studentNumber || !String(studentNumber).trim()) {
        return res.status(400).json({ message: "studentNumber is required" });
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
      if (!course || !String(course).trim()) {
        return res.status(400).json({ message: "course is required" });
      }
      if (!year || !String(year).trim()) {
        return res.status(400).json({ message: "year is required" });
      }
      if (!section || !String(section).trim()) {
        return res.status(400).json({ message: "section is required" });
      }
      if (!email || !String(email).trim()) {
        return res.status(400).json({ message: "email is required" });
      }
      if (!contactNumber || !String(contactNumber).trim()) {
        return res.status(400).json({ message: "contactNumber is required" });
      }

      const normalizedStudentNumber = String(studentNumber).trim();
      const normalizedLastName = String(lastName).trim();
      const normalizedFirstName = String(firstName).trim();
      const normalizedMiddleName = String(middleName).trim();
      const normalizedGender = String(gender).trim();
      const normalizedEmail = String(email).trim();
      const normalizedContactNumber = String(contactNumber).trim();

      const normalizedCourse = String(course).trim();
      const normalizedYear = String(year).trim();
      const normalizedSection = String(section).trim();

      const normalizedDateOfBirthRaw = dateOfBirth ? String(dateOfBirth).trim() : "";
      // Ensure DATE-only (YYYY-MM-DD) for MySQL DATE field.
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
           AND TABLE_NAME = 'students'
           AND COLUMN_NAME = 'name'`
      );
      const hasNameColumn = Number(nameColumnResult?.[0]?.count ?? 0) > 0;
      const resolvedName = `${normalizedFirstName} ${normalizedMiddleName} ${normalizedLastName}`.trim().replace(/\s+/g, ' ');

      // Build update SQL dynamically based on whether photo is included
      let updateSql;
      let updateParams;

      if (hasNameColumn) {
        if (normalizedPhoto !== undefined) {
          updateSql = `UPDATE students
             SET student_number = ?, qr_code = ?, name = ?, last_name = ?, first_name = ?,
                 middle_name = ?, gender = ?, date_of_birth = ?, email = ?,
                 contact_number = ?, course = ?, year = ?, section = ?, status = ?, photo = ?
             WHERE id = ?`;
          updateParams = [
            normalizedStudentNumber, normalizedStudentNumber, resolvedName,
            normalizedLastName, normalizedFirstName, normalizedMiddleName,
            normalizedGender, normalizedDateOfBirth, normalizedEmail,
            normalizedContactNumber, normalizedCourse, normalizedYear,
            normalizedSection, normalizedStatus, normalizedPhoto, id,
          ];
        } else {
          updateSql = `UPDATE students
             SET student_number = ?, qr_code = ?, name = ?, last_name = ?, first_name = ?,
                 middle_name = ?, gender = ?, date_of_birth = ?, email = ?,
                 contact_number = ?, course = ?, year = ?, section = ?, status = ?
             WHERE id = ?`;
          updateParams = [
            normalizedStudentNumber, normalizedStudentNumber, resolvedName,
            normalizedLastName, normalizedFirstName, normalizedMiddleName,
            normalizedGender, normalizedDateOfBirth, normalizedEmail,
            normalizedContactNumber, normalizedCourse, normalizedYear,
            normalizedSection, normalizedStatus, id,
          ];
        }
      } else {
        if (normalizedPhoto !== undefined) {
          updateSql = `UPDATE students
             SET student_number = ?, qr_code = ?, last_name = ?, first_name = ?,
                 middle_name = ?, gender = ?, date_of_birth = ?, email = ?,
                 contact_number = ?, course = ?, year = ?, section = ?, status = ?, photo = ?
             WHERE id = ?`;
          updateParams = [
            normalizedStudentNumber, normalizedStudentNumber,
            normalizedLastName, normalizedFirstName, normalizedMiddleName,
            normalizedGender, normalizedDateOfBirth, normalizedEmail,
            normalizedContactNumber, normalizedCourse, normalizedYear,
            normalizedSection, normalizedStatus, normalizedPhoto, id,
          ];
        } else {
          updateSql = `UPDATE students
             SET student_number = ?, qr_code = ?, last_name = ?, first_name = ?,
                 middle_name = ?, gender = ?, date_of_birth = ?, email = ?,
                 contact_number = ?, course = ?, year = ?, section = ?, status = ?
             WHERE id = ?`;
          updateParams = [
            normalizedStudentNumber, normalizedStudentNumber,
            normalizedLastName, normalizedFirstName, normalizedMiddleName,
            normalizedGender, normalizedDateOfBirth, normalizedEmail,
            normalizedContactNumber, normalizedCourse, normalizedYear,
            normalizedSection, normalizedStatus, id,
          ];
        }
      }

      const [result] = await pool.query(updateSql, updateParams);


      // result.affectedRows is available from mysql2
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({ message: "Student not found" });
      }

      return res.json({ message: "Student updated" });
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Student Number must be unique." });
      }
      return res.status(500).json({ message: "Failed to update student" });
    }
  });

  // DELETE /students/:id
  router.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      // Get photo path before deleting
      const [existing] = await pool.query("SELECT photo FROM students WHERE id = ?", [id]);
      if (existing && existing.length > 0 && existing[0].photo) {
        const photoPath = path.resolve(__dirname, "../../uploads", existing[0].photo);
        fs.unlink(photoPath, () => {});
      }

      const [result] = await pool.query("DELETE FROM students WHERE id = ?", [id]);

      // result.affectedRows is available from mysql2
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({ message: "Student not found" });
      }

      return res.json({ message: "Student deleted" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete student" });
    }
  });

  // DELETE /students
  router.delete("/", async (req, res) => {
    try {
      const [countResult] = await pool.query("SELECT COUNT(*) AS total FROM students");
      const deletedCount = Number(countResult?.[0]?.total ?? 0);

      const [nameColumnResult] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'students'
           AND COLUMN_NAME = 'name'`
      );
      const hasNameColumn = Number(nameColumnResult?.[0]?.count ?? 0) > 0;

      await pool.query("DROP TABLE IF EXISTS students");
      await pool.query(`CREATE TABLE students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_number VARCHAR(64) NOT NULL,
        qr_code VARCHAR(255) NULL,${hasNameColumn ? "\n        name VARCHAR(512) NOT NULL," : ""}
        last_name VARCHAR(255) NOT NULL,
        first_name VARCHAR(255) NOT NULL,
        middle_name VARCHAR(255) NOT NULL,
        gender VARCHAR(32) NOT NULL,
        date_of_birth DATE NULL,
        email VARCHAR(255) NOT NULL,
        contact_number VARCHAR(64) NOT NULL,
        course VARCHAR(64) NOT NULL,
        year VARCHAR(16) NOT NULL,
        section VARCHAR(16) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'Active',
        photo VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_students_student_number (student_number)
      )`);

      return res.json({
        message: "All students deleted",
        deletedCount,
      });
    } catch (err) {
      console.error("Failed to reset students table during bulk delete:", err);
      return res.status(500).json({ message: "Failed to delete all students" });
    }
  });

  return router;
}

