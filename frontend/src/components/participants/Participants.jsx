import { useEffect, useMemo, useState } from "react";

import ParticipantModal from "./ParticipantModal";
import ConfirmDialog from "./ConfirmDialog";
import ParticipantsTable from "./ParticipantsTable";
import ParticipantsToolbar from "./ParticipantsToolbar";
import ImportParticipantsModal from "./import/ImportParticipantsModal";
import { useOrgLabels } from "../../config/labels";
import participantsService from "../../services/participantsService";

import "../../styles/participants/Participants.css";

export default function Participants() {
  const labels = useOrgLabels();
const [query, setQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const [participants, setParticipants] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingParticipant, setIsDeletingParticipant] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const fetchParticipants = async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const data = await participantsService.getParticipants();
      setParticipants(Array.isArray(data.participants) ? data.participants : []);
    } catch (err) {
      setLoadError("Failed to load participants.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => fetchParticipants());
  }, []);

  const existingParticipants = useMemo(() => participants, [participants]);

  const filteredParticipants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participants;

    return participants.filter((p) => {
      const fullName = p.lastName || p.firstName
        ? `${p.lastName || ""}${p.firstName ? ", " + p.firstName : ""}${p.middleName ? " " + p.middleName : ""}`.trim()
        : p.name;

      return (
        String(p.id ?? "").toLowerCase().includes(q) ||
        String(p.participantIdentifier ?? p.studentNumber ?? "").toLowerCase().includes(q) ||
        String(fullName ?? "").toLowerCase().includes(q) ||
        String(p.gender ?? "").toLowerCase().includes(q) ||
        String(p.dateOfBirth ?? "").toLowerCase().includes(q) ||
        String(p.course ?? "").toLowerCase().includes(q) ||
        String(p.year ?? "").toLowerCase().includes(q) ||
        String(p.section ?? "").toLowerCase().includes(q) ||
        String(p.email ?? "").toLowerCase().includes(q) ||
        String(p.contactNumber ?? "").toLowerCase().includes(q) ||
        String(p.status ?? "").toLowerCase().includes(q)
      );
    });
  }, [participants, query]);

  const [editMode, setEditMode] = useState(false);
  const [deleteAllDraft, setDeleteAllDraft] = useState("");

  const [selectedParticipant, setSelectedParticipant] = useState(null);

  const [pendingDeleteParticipant, setPendingDeleteParticipant] = useState(null);
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
    setSelectedParticipant(null);
    setEditMode(false);
    setIsModalOpen(true);
  };

  const handleSave = async (newParticipant) => {
    if (isSaving) return false;

    setIsSaving(true);

    try {
      const normalizedIdentifier = String(newParticipant.participantIdentifier || "").trim().toLowerCase();
      const duplicateParticipant = existingParticipants.some((participant) => {
        const identifier = String(participant?.participantIdentifier ?? participant?.studentNumber ?? "").trim().toLowerCase();
        const isSameParticipant = selectedParticipant?.id != null && participant?.id != null
          ? String(participant.id) === String(selectedParticipant.id)
          : false;

        return Boolean(identifier && identifier === normalizedIdentifier && !isSameParticipant);
      });

      if (duplicateParticipant) {
        showToast("error", `${labels.primaryIdLabel} already exists.`);
        return false;
      }

      const payload = {
        participantIdentifier: newParticipant.participantIdentifier,
        lastName: newParticipant.lastName,
        firstName: newParticipant.firstName,
        middleName: newParticipant.middleName,
        gender: newParticipant.gender,
        dateOfBirth: newParticipant.dateOfBirth,
        email: newParticipant.email,
        contactNumber: newParticipant.contactNumber,
        department: newParticipant.course,
        level: newParticipant.year,
        groupName: newParticipant.section,
        status: newParticipant.status,
        photo: newParticipant.photo || null,
      };

      let responseData;
      try {
        if (editMode) {
          responseData = await participantsService.updateParticipant(selectedParticipant?.id, payload);
        } else {
          responseData = await participantsService.createParticipant(payload);
        }
      } catch (err) {
        // Log the real error for debugging instead of hiding it behind a
        // generic message.
        console.error(
          "Participant save failed:",
          err?.response?.status,
          err?.response?.data || err?.message,
          err
        );
        const backendMessage = err.response?.data?.message || err.message || "";
        const backendDetail = err.response?.data?.detail || "";
        let message;
        if (backendMessage === "Participant identifier must be unique.") {
          message = `${labels.primaryIdLabel} already exists.`;
        } else if (backendMessage) {
          // Show the actual validation/backend reason (e.g. "level is required")
          message = backendMessage + (backendDetail ? ` (${backendDetail})` : "");
        } else {
          message = editMode
            ? `Failed to update ${labels.entityName?.toLowerCase() || "entity"}.`
            : `Failed to add ${labels.entityName?.toLowerCase() || "entity"}.`;
        }
        showToast("error", message);
        return false;
      }

      // If there's a photo blob, upload it after creating the participant
      if (newParticipant.photoFile) {
        const participantId = editMode ? selectedParticipant?.id : responseData?.id;
        if (participantId) {
          try {
            await participantsService.uploadPhoto(participantId, newParticipant.photoFile);
          } catch (photoErr) {
            console.error("Photo upload failed", photoErr);
            showToast("error", `${labels.entityName} saved but photo upload failed.`);
          }
        }
      } else if (newParticipant.removePhoto && editMode) {
        // Remove photo if flag is set
        const participantId = selectedParticipant?.id;
        if (participantId) {
          try {
            await participantsService.deletePhoto(participantId);
          } catch (photoErr) {
            console.error("Photo deletion failed", photoErr);
          }
        }
      }

      await fetchParticipants();
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

  const participantFullName = (p) => {
    const parts = [p?.lastName, p?.firstName, p?.middleName]
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
    return p?.name ?? "";
  };

  const handleRequestDeleteParticipant = (p) => {
    setPendingDeleteParticipant(p);
    setSelectedParticipant(p);
    setEditMode(false);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteParticipant = async () => {
    if (isDeletingParticipant) return false;

    const p = pendingDeleteParticipant;
    const id = p?.id;
    const participantId = p?.participantIdentifier ?? p?.studentNumber ?? "";

    if (!id) return false;

    setIsDeletingParticipant(true);

    try {
      await participantsService.deleteParticipant(id);

      setIsDeleteDialogOpen(false);
      setPendingDeleteParticipant(null);
      await fetchParticipants();
      showToast("success", `${labels.entityName} ${participantId} deleted successfully.`);
      return true;
    } catch (e) {
      showToast("error", e?.message || `Failed to delete ${labels.entityName?.toLowerCase() || "entity"}.`);
      return false;
    } finally {
      setIsDeletingParticipant(false);
    }
  };

  const handleRequestDeleteAllParticipants = () => {
    setDeleteAllDraft("");
    setIsDeleteAllDialogOpen(true);
  };

  const confirmDeleteAllParticipants = async () => {
    if (isDeletingAll) return false;

    const typed = deleteAllDraft.trim();
    if (typed !== "DELETE ALL") return false;

    setIsDeletingAll(true);

    try {
      await participantsService.deleteAllParticipants();

      setIsDeleteAllDialogOpen(false);
      setDeleteAllDraft("");
      await fetchParticipants();
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
    <div className="participants-page">
<ParticipantsToolbar
        value={query}
        onChange={setQuery}
        onAddClick={handleAddClick}
        onImportClick={() => setIsImportOpen(true)}
        onDeleteAllClick={handleRequestDeleteAllParticipants}
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
        <div className="participants-table-empty" aria-live="polite">
          {loadError}
        </div>
      ) : null}

      <ParticipantsTable
        participants={filteredParticipants}
        query={query}
        onEditClick={(p) => {
          setSelectedParticipant(p);
          setEditMode(true);
          setIsModalOpen(true);
        }}
        onDeleteClick={handleRequestDeleteParticipant}
        isDeleting={isDeletingParticipant}
      />

      {isLoading ? null : null}

      <ParticipantModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
        }}
        onSave={handleSave}
        existingParticipants={existingParticipants}
        editMode={editMode}
        initialParticipant={selectedParticipant}
        isSubmitting={isSaving}
      />

<ConfirmDialog
        isOpen={isDeleteDialogOpen}
        title="Delete Participant"
        message="Are you sure you want to permanently delete this participant?"
        primaryLabel={isDeletingParticipant ? "Deleting..." : "Delete"}
        primaryVariant="danger"
        primaryDisabled={isDeletingParticipant}
        secondaryLabel="Cancel"
        onCancel={() => {
          setIsDeleteDialogOpen(false);
          setPendingDeleteParticipant(null);
        }}
        onPrimary={confirmDeleteParticipant}
        details={
          pendingDeleteParticipant ? (
            <div>
              <div>
                <b>Participant ID:</b> {pendingDeleteParticipant?.participantIdentifier ?? pendingDeleteParticipant?.studentNumber}
              </div>
              <div>
                <b>Full Name:</b> {participantFullName(pendingDeleteParticipant)}
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
        onPrimary={confirmDeleteAllParticipants}
        requireTypedText="DELETE ALL"
        typedText={deleteAllDraft}
onTypedTextChange={(val) => setDeleteAllDraft(val)}
        typedPlaceholder="DELETE ALL"
      />

      <ImportParticipantsModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImported={() => fetchParticipants()}
      />
    </div>
  );
}

