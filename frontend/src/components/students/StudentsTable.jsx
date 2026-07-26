import { useMemo } from "react";
import StudentPhoto from "./StudentPhoto";
import "../../styles/students/StudentsTable.css";

const EMPTY = "";

function formatDateOnly(value) {
  if (!value) return EMPTY;

  // If backend returns an ISO timestamp (e.g. 2004-01-10T16:00:00.000Z), extract YYYY-MM-DD.
  if (typeof value === "string") {
    const v = value.trim();
    if (!v) return EMPTY;
    return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v;
  }

  return String(value);
}

function StudentsTable({ students, query, onEditClick, onDeleteClick, isDeleting = false }) {

  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();

    if (!q) return students;

    return students.filter((s) => {
      const lastName = String(s.lastName ?? EMPTY);
      const firstName = String(s.firstName ?? EMPTY);
      const middleName = String(s.middleName ?? EMPTY);

      return (
        String(s.id ?? EMPTY).toLowerCase().includes(q) ||
        String(s.studentNumber ?? EMPTY).toLowerCase().includes(q) ||
        lastName.toLowerCase().includes(q) ||
        firstName.toLowerCase().includes(q) ||
        middleName.toLowerCase().includes(q) ||
        String(s.gender ?? EMPTY).toLowerCase().includes(q) ||
        String(s.dateOfBirth ?? EMPTY).toLowerCase().includes(q) ||
        String(s.course ?? EMPTY).toLowerCase().includes(q) ||
        String(s.year ?? EMPTY).toLowerCase().includes(q) ||
        String(s.section ?? EMPTY).toLowerCase().includes(q) ||
        String(s.email ?? EMPTY).toLowerCase().includes(q) ||
        String(s.contactNumber ?? EMPTY).toLowerCase().includes(q) ||
        String(s.status ?? EMPTY).toLowerCase().includes(q)
      );
    });
  }, [students, query]);

  return (
    <div className="students-table-wrap">
      <table className="students-table">
        <thead>
          <tr>
            <th className="col-id">#</th>
            <th className="col-photo">Photo</th>
            <th className="col-student-number">Student Number</th>
            <th className="col-last-name">Last Name</th>
            <th className="col-first-name">First Name</th>
            <th className="col-middle-name">Middle Name</th>
            <th className="col-gender">Gender</th>
            <th className="col-dob">Date of Birth</th>
            <th className="col-course">Course / Strand</th>
            <th className="col-year">Year Level</th>
            <th className="col-section">Section</th>
            <th className="col-email">Email Address</th>
            <th className="col-contact">Contact Number</th>
            <th className="col-status">Status</th>
            <th className="col-action">Action</th>
          </tr>
        </thead>

        <tbody>
{filtered.map((s, index) => (
            <tr key={s.id ?? `${s.studentNumber ?? "student"}-${index}`}>
              <td data-label="#">{index + 1}</td>
              <td data-label="Photo">
                <StudentPhoto
                  photoPath={s.photo}
                  studentName={`${s.firstName || ""} ${s.lastName || ""}`.trim()}
                  size={48}
                  alt="Student photo"
                />
              </td>
              <td data-label="Student Number">{s.studentNumber}</td>
              <td data-label="Last Name">{s.lastName}</td>
              <td data-label="First Name">{s.firstName}</td>
              <td data-label="Middle Name">{s.middleName}</td>
              <td data-label="Gender">{s.gender}</td>
              <td data-label="Date of Birth">{formatDateOnly(s.dateOfBirth)}</td>

              <td data-label="Course / Strand">{s.course}</td>
              <td data-label="Year Level">{s.year}</td>
              <td data-label="Section">{s.section}</td>
              <td data-label="Email Address">{s.email}</td>
              <td data-label="Contact Number">{s.contactNumber}</td>
              <td data-label="Status">
                <span className={s.status === "Active" ? "status ok" : "status"}>
                  {s.status}
                </span>
              </td>
              <td data-label="Action">
                <div className="students-action-cell">
                  <button type="button" className="students-action-btn" onClick={() => onEditClick?.(s)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="students-action-btn students-action-btn-danger"
                    onClick={() => onDeleteClick?.(s)}
                    aria-label={`Delete ${s.studentNumber}`}
                    disabled={Boolean(isDeleting)}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </td>

            </tr>
          ))}
        </tbody>
      </table>

      <div className="students-table-empty" aria-live="polite">
        {filtered.length === 0 ? "No students found." : null}
      </div>
    </div>
  );
}

export default StudentsTable;

