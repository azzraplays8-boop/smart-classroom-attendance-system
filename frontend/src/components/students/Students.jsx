import { useEffect, useMemo, useState } from "react";

import AddStudentModal from "./AddStudentModal";
import ConfirmDialog from "./ConfirmDialog";
import StudentsTable from "./StudentsTable";
import StudentsToolbar from "./StudentsToolbar";
import { useOrgLabels } from "../../config/labels";

import "../../styles/students/Students.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export default function Students() {
  const labels = useOrgLabels();
  const [query, setQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const fetchStudents = async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const res = await fetch(`${API_BASE_URL}/students`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setStudents(Array.isArray(data.students) ? data.students : []);
    } catch {
      setLoadError("Failed to load participants.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => fetchStudents());
  }, []);

  const existingStudents = useMemo(() => students, [students]);

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;

    return students.filter((s) => {
      const fullName = s.lastName || s.firstName
        ? `${s.lastName || ""}${s.firstName ? ", " + s.firstName : ""}${
            s.middleName ? " " + s.middleName : ""
          }`.trim()
        : s.name;

      return (
        String(s.id ?? "").toLowerCase().includes(q) ||
        String(s.studentNumber ?? "").toLowerCase().includes(q) ||
        String(fullName ?? "").toLowerCase().includes(q) ||
        String(s.gender ?? "").toLowerCase().includes(q) ||
        String(s.dateOfBirth ?? "").toLowerCase().includes(q) ||
        String(s.course ?? "").toLowerCase().includes(q) ||
        String(s.year ?? "").toLowerCase().includes(q) ||
        String(s.section ?? "").toLowerCase().includes(q) ||
        String(s.email ?? "").toLowerCase().includes(q) ||
        String(s.contactNumber ?? "").toLowerCase().includes(q) ||
        String(s.status ?? "").toLowerCase().includes(q)
      );
    });
  }, [students, query]);

  const [editMode, setEditMode] = useState(false);
  const [deleteAllDraft, setDeleteAllDraft] = useState("");

  const [selectedStudent, setSelectedStudent] = useState(null);

  const [pendingDeleteStudent, setPendingDeleteStudent] = useState(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);

  const [toast, setToast] = useState({ kind: "success", message: "" });
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (kind, message) => {
    setToast({ kind, message });
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 2600);
  };

  const handleAddClick = () => {
    setSelectedStudent(null);
    setEditMode(false);
    setIsModalOpen(true);
  };

  const handleSave = async (newStudent) => {
    if (isSaving) return false;

    setIsSaving(true);

    try {
      const normalizedStudentNumber = String(newStudent.studentNumber || "").trim().toLowerCase();
      const duplicateStudent = existingStudents.some((student) => {
        const studentNumber = String(student?.studentNumber ?? "").trim().toLowerCase();
        const isSameStudent = selectedStudent?.id != null && student?.id != null
          ? String(student.id) === String(selectedStudent.id)
          : false;

        return Boolean(studentNumber && studentNumber === normalizedStudentNumber && !isSameStudent);
      });

      if (duplicateStudent) {
        showToast("error", `${labels.primaryIdLabel} already exists.`);
        return false;
      }

      const payload = {
        studentNumber: newStudent.studentNumber,
        lastName: newStudent.lastName,
        firstName: newStudent.firstName,
        middleName: newStudent.middleName,
        gender: newStudent.gender,
        dateOfBirth: newStudent.dateOfBirth,
        email: newStudent.email,
        contactNumber: newStudent.contactNumber,
        course: newStudent.course,
        year: newStudent.year,
        section: newStudent.section,
        status: newStudent.status,
        photo: newStudent.photo || null,
      };

      const res = await fetch(
        editMode
          ? `${API_BASE_URL}/students/${selectedStudent?.id}`
          : `${API_BASE_URL}/students`,
        {
          method: editMode ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const responseBody = await res.json().catch(() => null);

      if (!res.ok) {
        const backendMessage = responseBody?.message || responseBody?.error || "";
        const message = backendMessage === "Student Number must be unique." || backendMessage === "Student Number already exists."
          ? `${labels.primaryIdLabel} already exists.`
          : editMode
            ? `Failed to update ${labels.entityName?.toLowerCase() || "entity"}.`
            : `Failed to add ${labels.entityName?.toLowerCase() || "entity"}.`;
        showToast("error", message);
        return false;
      }

      // If there's a photo blob, upload it after creating the student
      if (newStudent.photoFile) {
        const studentId = editMode ? selectedStudent?.id : responseBody?.id;
        if (studentId) {
          const photoFormData = new FormData();
          photoFormData.append("photo", newStudent.photoFile);
          const photoRes = await fetch(`${API_BASE_URL}/students/${studentId}/photo`, {
            method: "POST",
            body: photoFormData,
          });
          if (!photoRes.ok) {
            console.error("Photo upload failed");
            showToast("error", `${labels.entityName} saved but photo upload failed.`);
          }
        }
      } else if (newStudent.removePhoto && editMode) {
        // Remove photo if flag is set
        const studentId = selectedStudent?.id;
        if (studentId) {
          await fetch(`${API_BASE_URL}/students/${studentId}/photo`, {
            method: "DELETE",
          });
        }
      }

      await fetchStudents();
      setIsModalOpen(false);
      showToast(
        "success",
        editMode ? `${labels.entityName} updated successfully.` : `${labels.entityName} added successfully.`
      );
      return true;
    } catch (e) {
      showToast("error", e?.message || "Network/server error. Please try again.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const studentFullName = (s) => {
    const parts = [s?.lastName, s?.firstName, s?.middleName]
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
    return s?.name ?? "";
  };

  const handleRequestDeleteStudent = (s) => {
    setPendingDeleteStudent(s);
    setSelectedStudent(s);
    setEditMode(false);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteStudent = async () => {
    if (isDeletingStudent) return false;

    const s = pendingDeleteStudent;
    const id = s?.id;
    const studentNumber = s?.studentNumber ?? "";

    if (!id) return false;

    setIsDeletingStudent(true);

    try {
      const res = await fetch(`${API_BASE_URL}/students/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || `HTTP ${res.status}`);
      }

      setIsDeleteDialogOpen(false);
      setPendingDeleteStudent(null);
      await fetchStudents();
      showToast("success", `${labels.entityName} ${studentNumber} deleted successfully.`);
      return true;
    } catch (e) {
      showToast("error", e?.message || `Failed to delete ${labels.entityName?.toLowerCase() || "entity"}.`);
      return false;
    } finally {
      setIsDeletingStudent(false);
    }
  };

  const handleRequestDeleteAllStudents = () => {
    setDeleteAllDraft("");
    setIsDeleteAllDialogOpen(true);
  };

  const confirmDeleteAllStudents = async () => {
    if (isDeletingAll) return false;

    const typed = deleteAllDraft.trim();
    if (typed !== "DELETE ALL") return false;

    setIsDeletingAll(true);

    try {
      const res = await fetch(`${API_BASE_URL}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || `HTTP ${res.status}`);
      }

      setIsDeleteAllDialogOpen(false);
      setDeleteAllDraft("");
      await fetchStudents();
      showToast("success", `All ${labels.entityLabel?.toLowerCase() || "entities"} deleted successfully.`);
      return true;
    } catch (e) {
      showToast("error", e?.message || `Failed to delete all ${labels.entityLabel?.toLowerCase() || "entities"}.`);
      return false;
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="students-page">
      <StudentsToolbar
        value={query}
        onChange={setQuery}
        onAddClick={handleAddClick}
        onDeleteAllClick={handleRequestDeleteAllStudents}
        isDeleteAllDisabled={isDeletingAll}
        isDeletingAll={isDeletingAll}
      />

      <div
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 1200,
          pointerEvents: "none",
        }}
        aria-live="polite"
      >
        {toastVisible ? (
          <div
            style={{
              background: toast.kind === "success" ? "#dcfce7" : "#fee2e2",
              color: toast.kind === "success" ? "#166534" : "#991b1b",
              border: toast.kind === "success" ? "1px solid #86efac" : "1px solid #fca5a5",
              padding: "12px 14px",
              borderRadius: 12,
              fontWeight: 800,
              boxShadow: "0 12px 40px rgba(2,6,23,0.25)",
              maxWidth: 420,
            }}
          >
            {toast.message}
          </div>
        ) : null}
      </div>

      {loadError ? (
        <div className="students-table-empty" aria-live="polite">
          {loadError}
        </div>
      ) : null}

      <StudentsTable
        students={filteredStudents}
        query={query}
        onEditClick={(s) => {
          setSelectedStudent(s);
          setEditMode(true);
          setIsModalOpen(true);
        }}
        onDeleteClick={handleRequestDeleteStudent}
        isDeleting={isDeletingStudent}
      />

      {isLoading ? null : null}

      <AddStudentModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
        }}
        onSave={handleSave}
        existingStudents={existingStudents}
        editMode={editMode}
        initialStudent={selectedStudent}
        isSubmitting={isSaving}
      />

<ConfirmDialog
        isOpen={isDeleteDialogOpen}
        title="Delete Participant"
        message="Are you sure you want to permanently delete this participant?"
        primaryLabel={isDeletingStudent ? "Deleting..." : "Delete"}
        primaryVariant="danger"
        primaryDisabled={isDeletingStudent}
        secondaryLabel="Cancel"
        onCancel={() => {
          setIsDeleteDialogOpen(false);
          setPendingDeleteStudent(null);
        }}
        onPrimary={confirmDeleteStudent}
        details={
          pendingDeleteStudent ? (
            <div>
              <div>
                <b>Participant ID:</b> {pendingDeleteStudent?.studentNumber}
              </div>
              <div>
                <b>Full Name:</b> {studentFullName(pendingDeleteStudent)}
              </div>
            </div>
          ) : null
        }
      />

      <ConfirmDialog
        isOpen={isDeleteAllDialogOpen}
        title="Delete All Participants"
        message="This action will permanently delete ALL participant records."
        primaryLabel={isDeletingAll ? "Deleting All..." : "Delete All"}
        primaryVariant="danger"
        primaryDisabled={isDeletingAll}
        secondaryLabel="Cancel"
        onCancel={() => {
          setIsDeleteAllDialogOpen(false);
        }}
        onPrimary={confirmDeleteAllStudents}
        requireTypedText="DELETE ALL"
        typedText={deleteAllDraft}
        onTypedTextChange={(val) => setDeleteAllDraft(val)}
        typedPlaceholder="DELETE ALL"
      />
    </div>
  );
}

